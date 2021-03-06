"use strict";
const _ = require('lodash');
const EventEmitter = require('events');
const debug = require('debug')('CEG:ExchangeSubscriptionManager');
const logger = require('winston');
const Errors = require('./errors');
const AbstractExchangeClass = require('./abstract-exchange');

/**
 * Class which handles subscriptions to a single exchange
 *
 * It can emit following events (some events might not be available for all exchanges):
 *
 * - ticker (ticker update for a single pair)
 * - orderBook (full order book for a single pair)
 * - orderBookUpdate (order book update for a single pair)
 * - trades (new trades for a single pair)
 */

// how often in ms should we retrieve tickers
const TICKERS_LOOP_DEFAULT_PERIOD = 30 * 1000;

// how often in ms should we retrieve order book
const ORDER_BOOK_LOOP_DEFAULT_PERIOD = 30 * 1000;

// how often in ms should we retrieve trades
const TRADES_LOOP_DEFAULT_PERIOD = 30 * 1000;

class AbstractExchangeSubscriptionManager extends EventEmitter
{

/**
 * Constructor
 *
 * @param {object} exchange Exchange instance
 * @param {boolean} opt.marketsSubscription indicates exchange support market subscription (ie: orderbook & trades at the same time) (optional, default = true)
 * @param {boolean} opt.globalTickersSubscription indicates exchange support a single subscription for all tickers (optional, default = true)
 */
constructor(exchange, options)
{
    if (!(exchange instanceof AbstractExchangeClass))
    {
        throw new Error("Parameter 'exchange' should be an 'AbstractExchange' instance")
    }
    super();
    this._globalTickersSubscription = true;
    this._marketsSubscription = true;
    // used to emulate ws by doing periodic REST requests
    this._emulatedWs = {
        wsTickers:{
            enabled:false,
            list:{},
            period:TICKERS_LOOP_DEFAULT_PERIOD
        },
        wsOrderBooks:{
            enabled:false,
            list:{},
            period:ORDER_BOOK_LOOP_DEFAULT_PERIOD
        },
        wsTrades:{
            enabled:false,
            list:{},
            period:TRADES_LOOP_DEFAULT_PERIOD
        }
    }
    // check if we need ws emulation
    let features = exchange.getFeatures();
    _.forEach(['wsTickers','wsOrderBooks','wsTrades'], (type) => {
        if (features[type].enabled && features[type].emulated)
        {
            this._emulatedWs[type].enabled = true;
            this._emulatedWs[type].period = features[type].period * 1000;
        }
    });
    if (undefined !== options)
    {
        if (false === options.marketsSubscription)
        {
            this._marketsSubscription = false;
        }
        if (false === options.globalTickersSubscription)
        {
            this._globalTickersSubscription = false;
        }
    }
    this._exchangeInstance = exchange;
    this._exchangeId = exchange.getId();
    this._subscriptions = {
        tickers:{
            timestamp:null,
            // indicates whether or not we're subscribed to global tickers
            subscribed:false,
            pairs:{},
            count:0
        },
        markets:{
            pairs:{},
            count:0
        },
        orderBooks:{
            timestamp:null,
            pairs:{},
            count:0
        },
        trades:{
            timestamp:null,
            pairs:{},
            count:0
        },
        klines:{
            timestamp:null,
            pairs:{},
            count:0
        }
    }
    // keep track of established connections
    this._connections = {}
}

toHash()
{
    let obj = this._toHash();
    obj.subscriptions = this.getSubscriptions();
    obj.connections = this.getConnections();
    return obj;
}

_toHash()
{
    let obj = {
        exchange:this._exchangeId
    }
    return obj;
}

/**
 * Called when a connection to the exchange has been successfully established
 *
 * @param {string} name connection name
 * @param {object} data connection data
 */
_registerConnection(name, data)
{
    if (undefined === data)
    {
        data = {};
    }
    let timestamp = (new Date().getTime()) / 1000.0;
    this._connections[name] = {timestamp:timestamp,data:data};
}

/**
 * Called when a connection to the exchange has been closed
 *
 * @param {string} connection name
 */
_unregisterConnection(name)
{
    delete this._connections[name];
}

hasSubscriptions()
{
    return 0 != this._subscriptions.tickers.count || 0 != this._subscriptions.orderBooks.count ||
        0 != this._subscriptions.trades.count;
}

/*
 * The result of being lazy
 */
_debugChanges(changes)
{
    try
    {
        let stack = new Error().stack;
        let line = stack.split('\n')[2];
        let method = line.replace(/^.* at [a-zA-Z0-9_.][a-zA-Z0-9_]*\.([a-zA-Z0-9_]+).*$/, '$1');
        debug(`Method '${method}' will trigger following changes for '${this._exchangeId}' : ${JSON.stringify(changes)}`);
    }
    catch (e)
    {
        return;
    }
}

/**
 * Initialize tickers subscriptions for a given pair
 *
 * @param {string} sessionId session id
 * @param {float} timestamp timestamp of the first subscription
 */
_initializeTickersPair(sessionId, timestamp)
{
    let obj = {
        // last time subscriptions for current pair have changed
        timestamp:timestamp,
        // list of sessions which have a subscription for current pair
        sessions:{}
    }
    obj.sessions[sessionId] = timestamp;
    return obj;
}

/**
 * Subscribe/unsubscribe to tickers stream for a list of pairs
 *
 * @param {string} sessionId session id
 * @param {array} subscribe list of pairs to subscribe to
 * @param {array} unsubscribe list of pairs to unsubscribe from
 * @param {boolean} connect whether or not stream clients should be connected (optional, default = true)
 */
updateTickersSubscriptions(sessionId, subscribe, unsubscribe, connect)
{
    if ('string' != typeof(sessionId) || '' === sessionId)
    {
        throw Error("Argument 'sessionId' should be a non-empty string");
    }
    if (undefined === connect)
    {
        connect = true;
    }
    let timestamp = (new Date().getTime()) / 1000.0;
    let changes = {
        subscribe:[],
        unsubscribe:[]
    };
    let updated = false;

    // process subscribe
    _.forEach(subscribe, (p) => {
        // no subscriptions for this pair yet
        if (undefined === this._subscriptions.tickers.pairs[p])
        {
            this._subscriptions.tickers.pairs[p] = this._initializeTickersPair(sessionId, timestamp);
            if (!this._globalTickersSubscription)
            {
                changes.subscribe.push({entity:'ticker',pair:p});
            }
            updated = true;
        }
        else
        {
            if (undefined === this._subscriptions.tickers.pairs[p].sessions[sessionId])
            {
                this._subscriptions.tickers.pairs[p].sessions[sessionId] = timestamp;
            }
        }
    });

    // process unsubscribe
    _.forEach(unsubscribe, (p) => {
        // no subscription for this pair
        if (undefined === this._subscriptions.tickers.pairs[p])
        {
            return;
        }
        // no subscription for this session
        if (undefined === this._subscriptions.tickers.pairs[p].sessions[sessionId])
        {
            return;
        }
        delete this._subscriptions.tickers.pairs[p].sessions[sessionId];
        if (_.isEmpty(this._subscriptions.tickers.pairs[p].sessions))
        {
            delete this._subscriptions.tickers.pairs[p];
            if (!this._globalTickersSubscription)
            {
                changes.unsubscribe.push({entity:'ticker',pair:p});
            }
            updated = true;
        }
    });
    if (updated)
    {
        if (this._globalTickersSubscription)
        {
            // no more subscribed pairs ?
            if (_.isEmpty(this._subscriptions.tickers.pairs))
            {
                if (this._subscriptions.tickers.subscribed)
                {
                    this._subscriptions.tickers.subscribed = false;
                    changes.unsubscribe.push({entity:'tickers'})
                }
            }
            else
            {
                if (!this._subscriptions.tickers.subscribed)
                {
                    this._subscriptions.tickers.subscribed = true;
                    changes.subscribe.push({entity:'tickers'})
                }
            }
        }
        if (debug.enabled)
        {
            this._debugChanges(changes);
        }
        this._subscriptions.tickers.timestamp = timestamp;
        this._subscriptions.tickers.count = Object.keys(this._subscriptions.tickers.pairs).length;
        if (!this._emulatedWs.wsTickers.enabled)
        {
            this._processChanges(changes, {connect:connect});
        }
        else
        {
            this._processTickersLoops(changes, {connect:connect});
        }
    }
}

/**
 * Initialize order books subscriptions for a given pair
 *
 * @param {string} sessionId session id
 * @param {float} timestamp timestamp of the first subscription
 */
_initializeOrderBooksPair(sessionId, timestamp)
{
    let obj = {
        // last time subscriptions for current pair have changed
        timestamp:timestamp,
        // list of sessions which have a subscription for current pair
        sessions:{}
    }
    obj.sessions[sessionId] = timestamp;
    return obj;
}

/**
 * Subscribe to order books stream for a list of pairs
 *
 * @param {string} sessionId session id
 * @param {array} subscribe list of pairs to subscribe to
 * @param {array} unsubscribe list of pairs to unsubscribe from
 * @param {array} resync list of pairs to resync
 * @param {boolean} connect whether or not stream clients should be connected (optional, default = true)
 */
updateOrderBooksSubscriptions(sessionId, subscribe, unsubscribe, resync, connect)
{
    if ('string' != typeof(sessionId) || '' === sessionId)
    {
        throw Error("Argument 'sessionId' should be a non-empty string");
    }
    if (undefined === connect)
    {
        connect = true;
    }
    let timestamp = (new Date().getTime()) / 1000.0;
    let changes = {
        subscribe:[],
        unsubscribe:[],
        resync:[]
    };
    let updated = false;

    // process unsubscribe
    _.forEach(unsubscribe, (p) => {
        // no subscription for this pair
        if (undefined === this._subscriptions.orderBooks.pairs[p])
        {
            return;
        }
        // no subscription for this session
        if (undefined === this._subscriptions.orderBooks.pairs[p].sessions[sessionId])
        {
            return;
        }
        delete this._subscriptions.orderBooks.pairs[p].sessions[sessionId];
        if (_.isEmpty(this._subscriptions.orderBooks.pairs[p].sessions))
        {
            delete this._subscriptions.orderBooks.pairs[p];
            if (this._marketsSubscription)
            {
                if (this._unsubscribeFromMarket(p))
                {
                    changes.unsubscribe.push({entity:'market',pair:p});
                }
            }
            else
            {
                changes.unsubscribe.push({entity:'orderBook',pair:p});
            }
            updated = true;
        }
    });

    // process subscribe
    _.forEach(subscribe, (p) => {
        // no subscriptions for this pair yet
        if (undefined === this._subscriptions.orderBooks.pairs[p])
        {
            this._subscriptions.orderBooks.pairs[p] = this._initializeOrderBooksPair(sessionId, timestamp);
            if (this._marketsSubscription)
            {
                if (this._subscribeToMarket(p, timestamp))
                {
                    changes.subscribe.push({entity:'market',pair:p});
                }
            }
            else
            {
                changes.subscribe.push({entity:'orderBook',pair:p});
            }
            updated = true;
        }
        else
        {
            if (undefined === this._subscriptions.orderBooks.pairs[p].sessions[sessionId])
            {
                this._subscriptions.orderBooks.pairs[p].sessions[sessionId] = timestamp;
            }
        }
    });

    // process resync
    _.forEach(resync, (p) => {
        // no subscription for this pair
        if (undefined === this._subscriptions.orderBooks.pairs[p])
        {
            return;
        }
        // no subscription for this session
        if (undefined === this._subscriptions.orderBooks.pairs[p].sessions[sessionId])
        {
            return;
        }
        changes.resync.push({entity:'orderBook',pair:p});
    });

    if (updated || 0 != changes.resync.length)
    {
        if (debug.enabled)
        {
            this._debugChanges(changes);
        }
        if (updated)
        {
            this._subscriptions.orderBooks.timestamp = timestamp;
        }
        this._subscriptions.orderBooks.count = Object.keys(this._subscriptions.orderBooks.pairs).length;
        this._subscriptions.markets.count = Object.keys(this._subscriptions.markets.pairs).length;
        if (!this._emulatedWs.wsOrderBooks.enabled)
        {
            this._processChanges(changes, {connect:connect});
        }
        else
        {
            this._processOrderBooksLoops(changes, {connect:connect});
        }
    }
}

/**
 * Initialize trades subscriptions for a given pair
 *
 * @param {string} sessionId session id
 * @param {float} timestamp timestamp of the first subscription
 */
_initializeTradesPair(sessionId, timestamp)
{
    let obj = {
        // last time subscriptions for current pair have changed
        timestamp:timestamp,
        // list of sessions which have a subscription for current pair
        sessions:{}
    }
    obj.sessions[sessionId] = timestamp;
    return obj;
}

/**
 * Subscribe to order books stream for a list of pairs
 *
 * @param {string} sessionId session id
 * @param {array} subscribe list of pairs to subscribe to
 * @param {array} unsubscribe list of pairs to unsubscribe from
 * @param {boolean} connect whether or not stream clients should be connected (optional, default = true)
 */
updateTradesSubscriptions(sessionId, subscribe, unsubscribe, connect)
{
    if ('string' != typeof(sessionId) || '' === sessionId)
    {
        throw Error("Argument 'sessionId' should be a non-empty string");
    }
    if (undefined === connect)
    {
        connect = true;
    }
    let timestamp = (new Date().getTime()) / 1000.0;
    let changes = {
        subscribe:[],
        unsubscribe:[]
    };
    let updated = false;

    // process subscribe
    _.forEach(subscribe, (p) => {
        // no subscriptions for this pair yet
        if (undefined === this._subscriptions.trades.pairs[p])
        {
            this._subscriptions.trades.pairs[p] = this._initializeTradesPair(sessionId, timestamp);
            if (this._marketsSubscription)
            {
                if (this._subscribeToMarket(p, timestamp))
                {
                    changes.subscribe.push({entity:'market',pair:p});
                }
            }
            else
            {
                changes.subscribe.push({entity:'trades',pair:p});
            }
            updated = true;
        }
        else
        {
            if (undefined === this._subscriptions.trades.pairs[p].sessions[sessionId])
            {
                this._subscriptions.trades.pairs[p].sessions[sessionId] = timestamp;
            }
        }
    });

    // process unsubscribe
    _.forEach(unsubscribe, (p) => {
        // no subscription for this pair
        if (undefined === this._subscriptions.trades.pairs[p])
        {
            return;
        }
        // no subscription for this session
        if (undefined === this._subscriptions.trades.pairs[p].sessions[sessionId])
        {
            return;
        }
        delete this._subscriptions.trades.pairs[p].sessions[sessionId];
        if (_.isEmpty(this._subscriptions.trades.pairs[p].sessions))
        {
            delete this._subscriptions.trades.pairs[p];
            if (this._marketsSubscription)
            {
                if (this._unsubscribeFromMarket(p))
                {
                    changes.unsubscribe.push({entity:'market',pair:p});
                }
            }
            else
            {
                changes.unsubscribe.push({entity:'trades',pair:p});
            }
            updated = true;
        }
    });

    if (updated)
    {
        if (debug.enabled)
        {
            this._debugChanges(changes);
        }
        this._subscriptions.trades.timestamp = timestamp;
        this._subscriptions.trades.count = Object.keys(this._subscriptions.trades.pairs).length;
        this._subscriptions.markets.count = Object.keys(this._subscriptions.markets.pairs).length;
        if (!this._emulatedWs.wsOrderBooks.enabled)
        {
            this._processChanges(changes, {connect:connect});
        }
        else
        {
            this._processTradesLoops(changes, {connect:connect});
        }
    }
}

/**
 * Initialize klines subscription
 *
 * @param {string} sessionId session id
 * @param {float} timestamp timestamp of the first subscription
 */
_initializeKlinesPair(sessionId, timestamp)
{
    let obj = {
        // last time subscriptions for current pair have changed
        timestamp:timestamp,
        // list of sessions which have a subscription for current pair
        sessions:{}
    }
    obj.sessions[sessionId] = timestamp;
    return obj;
}

/**
 * Subscribe to klines stream for a list of pairs
 *
 * @param {string} sessionId session id
 * @param {array} subscribe list of pairs/intervals to subscribe to {pair:string,interval:string}
 * @param {array} unsubscribe list of pairs/intervals to unsubscribe from
 * @param {boolean} connect whether or not stream clients should be connected (optional, default = true)
 */
updateKlinesSubscriptions(sessionId, subscribe, unsubscribe, connect)
{
    if ('string' != typeof(sessionId) || '' === sessionId)
    {
        throw Error("Argument 'sessionId' should be a non-empty string");
    }
    if (undefined === connect)
    {
        connect = true;
    }
    let timestamp = (new Date().getTime()) / 1000.0;
    let changes = {
        subscribe:[],
        unsubscribe:[]
    };
    let updated = false;

    // process subscribe
    _.forEach(subscribe, (e) => {
        // no subscriptions for this pair yet
        if (undefined === this._subscriptions.klines.pairs[e.pair])
        {
            this._subscriptions.klines.pairs[e.pair] = {};
        }
        // no subscription for this interval
        if (undefined === this._subscriptions.klines.pairs[e.pair][e.interval])
        {
            this._subscriptions.klines.pairs[e.pair][e.interval] = this._initializeKlinesPair(sessionId, timestamp);
            changes.subscribe.push({entity:'klines',pair:e.pair,interval:e.interval});
            updated = true;
        }
        else
        {
            if (undefined === this._subscriptions.klines.pairs[e.pair][e.interval].sessions[sessionId])
            {
                this._subscriptions.klines.pairs[e.pair][e.interval].sessions[sessionId] = timestamp;
            }
        }
    });

    // process unsubscribe
    _.forEach(unsubscribe, (e) => {
        // no subscription for this pair
        if (undefined === this._subscriptions.klines.pairs[e.pair])
        {
            return;
        }
        // no subscription for this interval
        if (undefined === this._subscriptions.klines.pairs[e.pair][e.interval])
        {
            return;
        }
        // no subscription for this session
        if (undefined === this._subscriptions.klines.pairs[e.pair][e.interval].sessions[sessionId])
        {
            return;
        }
        delete this._subscriptions.klines.pairs[e.pair][e.interval].sessions[sessionId];
        if (_.isEmpty(this._subscriptions.klines.pairs[e.pair][e.interval].sessions))
        {
            changes.unsubscribe.push({entity:'klines',pair:e.pair,interval:e.interval});
            delete this._subscriptions.klines.pairs[e.pair][e.interval];
            if (_.isEmpty(this._subscriptions.klines.pairs[e.pair]))
            {
                delete this._subscriptions.klines.pairs[e.pair];
            }
            updated = true;
        }
    });

    if (updated)
    {
        if (debug.enabled)
        {
            this._debugChanges(changes);
        }
        this._subscriptions.klines.timestamp = timestamp;
        this._subscriptions.klines.count = 0;
        _.forEach(this._subscriptions.klines.pairs, (e, p) => {
            this._subscriptions.klines.count += Object.keys(e).length
        });
        this._processChanges(changes, {connect:connect});
    }
}

/**
 * Returns true if a new subscription to this market should be setup (ie: if there is no existing subscription for orderBook or trades)
 */
_subscribeToMarket(pair, timestamp)
{
    // if exchange does not support market subscriptions, do nothing
    if (!this._marketsSubscription)
    {
        return false;
    }
    if (undefined !== this._subscriptions.markets.pairs[pair])
    {
        return false;
    }
    this._subscriptions.markets.pairs[pair] = {timestamp:timestamp};
    return true;
}

/**
 * Returns true if subscription to this market should be cancelled (ie: if no subscription for orderBook or trades exists)
 */
_unsubscribeFromMarket(pair)
{
    // if exchange does not support market subscriptions, do nothing
    if (!this._marketsSubscription)
    {
        return false;
    }
    // we still have one subscription
    if (undefined !== this._subscriptions.orderBooks.pairs[pair] || undefined !== this._subscriptions.trades.pairs[pair])
    {
        return false;
    }
    delete this._subscriptions.markets.pairs[pair];
    return true;
}

/**
 * List existing connections (ie: established connections to exchange)
 *
 * NB : 'data' property format is exchange dependant
 *
 * @return {object} {"name":{timestamp:float,data:{}}
 */
getConnections()
{
    let connections = {};
    _.forEach(this._connections, (entry, name) => {
        connections[name] = {timestamp:entry.timestamp,data:entry.data}
    });
    return connections;
}

/**
 * List existing subscriptions
 *
 * @return {object} {tickers:{},orderBooks:{},trades:{},klines:{}}
 */
getSubscriptions()
{
    let entities = ['tickers','orderBooks','trades','klines'];
    let subscriptions = {};
    _.forEach(entities, (entity) => {
        if (undefined !== this._subscriptions[entity] && null !== this._subscriptions[entity].timestamp)
        {
            subscriptions[entity] = {
                timestamp:this._subscriptions[entity].timestamp,
                pairs:{}
            }
            _.forEach(this._subscriptions[entity].pairs, (entry, pair) => {
                if ('klines' == entity)
                {
                    _.forEach(entry, (obj, interval) => {
                        if (undefined === subscriptions[entity].pairs[pair])
                        {
                            subscriptions[entity].pairs[pair] = {};
                        }
                        subscriptions[entity].pairs[pair][interval] = {timestamp:obj.timestamp};
                    });
                }
                else
                {
                    subscriptions[entity].pairs[pair] = {timestamp:entry.timestamp};
                }
            });
        }
    });
    return subscriptions;
}

/**
 * Process subscription changes
 *
 * Method should be overriden in children
 *
 * @param {object} changes list of changes to process
 * @param {boolean} opt.connect whether or not changes should trigger a connection
 * @param {object} opt.client {entity:string,pair:string,client:object} (optional, only useful if exchange requires multiple stream clients) (will only be set upon WS connection/reconnection)
 *
 *  Each property (subscribe,unsubscribe,resync) is optional
 *  Entity can be (ticker,tickers,orderBook,trades,market)
 *
 * {
 *    "subscribe":[{"entity":"","pair":""},...],
 *    "unsubscribe":[{"entity":"","pair":""},...],
 *    "resync":[{"entity":"","pair":""},...]
 * }
 */
_processChanges(changes, opt)
{
    throw new Error('Override !');
}

/**
 * This method will be called upon reconnection and will call _processChanges
 *
 * @param {object} streamClientDescriptor {entity:string,pair:string,client:object} (optional, only useful if exchange requires multiple stream clients)
 */
_processSubscriptions(streamClientDescriptor)
{
    let changes = {
        subscribe:[]
    };
    _.forEach(this._subscriptions, (obj, entity) => {
        let key = entity;
        switch (entity)
        {
            case 'tickers':
                // ignore as it is already managed by tickers loop
                if (this._emulatedWs.wsTickers.enabled)
                {
                    return;
                }
                key = 'ticker';
                break;
            case 'orderBooks':
                key = 'orderBook';
                break;
            case 'markets':
                if (!this._marketsSubscription)
                {
                    return;
                }
                key = 'market';
                break;
        }
        _.forEach(obj.pairs, (entry, p) => {
            if ('klines' == key)
            {
                _.forEach(entry, (obj, interval) => {
                    changes.subscribe.push({entity:key,pair:p,interval:interval});
                });
            }
            else
            {
                changes.subscribe.push({entity:key,pair:p});
            }
        });
    });
    if (this._globalTickersSubscription && !this._emulatedWs.wsTickers.enabled)
    {
        if (this._subscriptions.tickers.subscribed)
        {
            changes.subscribe.push({entity:'tickers'});
        }
    }
    if (0 == changes.subscribe.length)
    {
        return;
    }
    this._processChanges(changes, {connect:true, client:streamClientDescriptor});
}

//-- tickers loops are used to emulate wsTickers when exchange does not support ws

/**
 * @param {object} changes list of changes to process
 * @param {boolean} opt.connect whether or not changes should trigger a connection
 *
 *  Each property (subscribe,unsubscribe) is optional
 *  Entity can be (ticker,tickers)
 *
 * {
 *    "subscribe":[{"entity":"","pair":""},...],
 *    "unsubscribe":[{"entity":"","pair":""},...]
 * }
 */
_processTickersLoops(changes, opt)
{
    // check if we need to unsubscribe
    if (undefined !== changes.unsubscribe)
    {
        _.forEach(changes.unsubscribe, (entry) => {
            switch (entry.entity)
            {
                case 'ticker':
                    this._unregisterTickersLoop(entry.pair);
                    break;
                case 'tickers':
                    this._unregisterGlobalTickersLoop();
                    break;
            }
        });
    }
    // check if we need to subscribe
    if (undefined !== changes.subscribe)
    {
        // only if we'be been asked to connect to exchange streams
        if (opt.connect)
        {
            _.forEach(changes.subscribe, (entry) => {
                switch (entry.entity)
                {
                    case 'ticker':
                        this._registerTickersLoop(entry.pair);
                        break;
                    case 'tickers':
                        this._registerGlobalTickersLoop();
                        break;
                }
            });
        }
    }
}

/**
 * Starts a global ticker loop (will be called if exchange supports retrieving tickers for all pairs)
 */
_registerGlobalTickersLoop()
{
    let loop_id = 'global';
    // initialize loop information
    if (undefined === this._emulatedWs.wsTickers.list[loop_id])
    {
        this._emulatedWs.wsTickers.list[loop_id] = {enabled:false,timer:null};
    }
    // we already have a loop
    if (this._emulatedWs.wsTickers.list[loop_id].enabled)
    {
        return;
    }
    if (debug.enabled)
    {
        debug(`Starting global ticker loop for exchange '${this._exchangeId}'`);
    }
    let self = this;
    let timestamp = Date.now() / 1000.0;
    this._emulatedWs.wsTickers.list[loop_id].enabled = true;
    this._emulatedWs.wsTickers.list[loop_id].timestamp = timestamp;
    this._registerConnection(`ticker-${loop_id}`);
    const doRequest = function(){
        if (debug.enabled)
        {
            debug(`Retrieving tickers for exchange '${self._exchangeId}'`);
        }
        self._exchangeInstance.getTickers().then((data) => {
            // loop has been disabled
            if (!self._emulatedWs.wsTickers.list[loop_id].enabled)
            {
                return;
            }
            // we already have a newer loop
            if (self._emulatedWs.wsTickers.list[loop_id].timestamp > timestamp)
            {
                return;
            }
            if (debug.enabled)
            {
                debug(`Got new tickers for exchange '${self._exchangeId}'`);
            }
            // process each subscribed pair
            _.forEach(self._subscriptions.tickers.pairs, (e, pair) => {
                if (undefined !== data[pair])
                {
                    let evt = {
                        exchange:self._exchangeId,
                        pair:pair,
                        data:data[pair]
                    }
                    self.emit('ticker', evt);
                }
            });
            // schedule next loop
            self._emulatedWs.wsTickers.list[loop_id].timer = setTimeout(function(){
                doRequest();
            }, self._emulatedWs.wsTickers.period);
        }).catch((e) => {
            // try again after 5s
            let period = 5000;
            if (period > self._emulatedWs.wsTickers.period)
            {
                period = self._emulatedWs.wsTickers.period;
            }
            logger.warn(`Could not retrieve tickers for exchange '${self._exchangeId}' : will try again in ${period} ms`);
            if (e instanceof Errors.BaseError)
            {
                logger.warn(JSON.stringify(e));
            }
            else
            {
                logger.warn(e.stack);
            }
            self._emulatedWs.wsTickers.list[loop_id].timer = setTimeout(function(){
                doRequest();
            }, period);
        });
    }
    doRequest();
}

/*
 * Stops global ticker loop (will be called if exchange supports retrieving tickers for all pairs)
 */
_unregisterGlobalTickersLoop()
{
    let loop_id = 'global';
    // loop is already disabled
    if (undefined === this._emulatedWs.wsTickers.list[loop_id] || !this._emulatedWs.wsTickers.list[loop_id].enabled)
    {
        return;
    }
    if (debug.enabled)
    {
        debug(`Stopping global ticker loop for exchange '${this._exchangeId}'`);
    }
    this._unregisterConnection(`ticker-${loop_id}`);
    this._emulatedWs.wsTickers.list[loop_id].enabled = false;
    if (null !== this._emulatedWs.wsTickers.list[loop_id].timer)
    {
        clearTimeout(this._emulatedWs.wsTickers.list[loop_id].timer);
        this._emulatedWs.wsTickers.list[loop_id].timer = null;
    }
    this._emulatedWs.wsTickers.list[loop_id].timer = null;
    this._emulatedWs.wsTickers.list[loop_id].timestamp = Date.now() / 1000.0;
}

/**
 * Starts a ticker loop for a given pair (will be called if exchange does not support retrieving tickers for all pairs)
 *
 * @param {string} pair pair to retrieve ticker for
 */
_registerTickersLoopForPair(pair)
{
    let loop_id = pair;
    // initialize loop information
    if (undefined === this._emulatedWs.wsTickers.list[loop_id])
    {
        this._emulatedWs.wsTickers.list[loop_id] = {enabled:false, timer:null};
    }
    // we already have a loop
    if (this._emulatedWs.wsTickers.list[loop_id].enabled)
    {
        return;
    }
    if (debug.enabled)
    {
        debug(`Starting '${pair}' ticker loop for exchange '${this._exchangeId}'`);
    }
    let self = this;
    let timestamp = Date.now() / 1000.0;
    this._emulatedWs.wsTickers.list[loop_id].enabled = true;
    this._emulatedWs.wsTickers.list[loop_id].timestamp = timestamp;
    this._registerConnection(`ticker-${loop_id}`);
    const doRequest = function(){
        if (debug.enabled)
        {
            debug(`Retrieving '${pair}' tickers for exchange '${self._exchangeId}'`);
        }
        self._exchangeInstance.getTickers().then((data) => {
            // loop has been disabled
            if (!self._emulatedWs.wsTickers.list[loop_id].enabled)
            {
                return;
            }
            // we already have a newer loop
            if (self._emulatedWs.wsTickers.list[loop_id].timestamp > timestamp)
            {
                return;
            }
            if (undefined !== data[pair])
            {
                if (debug.enabled)
                {
                    debug(`Got new '${pair}' ticker for exchange '${self._exchangeId}'`);
                }
                let evt = {
                    exchange:self._exchangeId,
                    pair:pair,
                    data:data[pair]
                }
                self.emit('ticker', evt);
            }
            // schedule next loop
            self._emulatedWs.wsTickers.list[loop_id].timer = setTimeout(function(){
                doRequest();
            }, self._emulatedWs.wsTickers.period);
        }).catch((e) => {
            // try again after 5s
            let period = 5000;
            if (period > self._emulatedWs.wsTickers.period)
            {
                period = self._emulatedWs.wsTickers.period;
            }
            logger.warn(`Could not retrieve '${pair}' ticker for exchange '${self._exchangeId}' : will try again in ${period} ms`);
            if (e instanceof Errors.BaseError)
            {
                logger.warn(JSON.stringify(e));
            }
            else
            {
                logger.warn(e.stack);
            }
            self._emulatedWs.wsTickers.list[loop_id].timer = setTimeout(function(){
                doRequest();
            }, period);
        });
    }
    doRequest();
}

/**
 * Stops ticker loop for a given pair (will be called if exchange does not support retrieving tickers for all pairs)
 *
 * @param {string} pair pair to unsubscribe from
 */
_unregisterTickersLoopForPair(pair)
{
    let loop_id = pair;
    // loop is already disabled
    if (undefined === this._emulatedWs.wsTickers.list[loop_id] || !this._emulatedWs.wsTickers.list[loop_id].enabled)
    {
        return;
    }
    if (debug.enabled)
    {
        debug(`Stopping '${pair}' ticker loop for exchange '${this._exchangeId}'`);
    }
    this._unregisterConnection(`ticker-${loop_id}`);
    this._emulatedWs.wsTickers.list[loop_id].enabled = false;
    if (null !== this._emulatedWs.wsTickers.list[loop_id].timer)
    {
        clearTimeout(this._emulatedWs.wsTickers.list[loop_id].timer);
        this._emulatedWs.wsTickers.list[loop_id].timer = null;
    }
    this._emulatedWs.wsTickers.list[loop_id].timestamp = Date.now() / 1000.0;
}

//-- order books loops are used to emulate wsOrderBooks when exchange does not support ws

/**
 * @param {object} changes list of changes to process
 * @param {boolean} opt.connect whether or not changes should trigger a connection
 *
 *  Each property (subscribe,unsubscribe) is optional
 *  Entity can be (orderBook)
 *
 * {
 *    "subscribe":[{"entity":"","pair":""},...],
 *    "unsubscribe":[{"entity":"","pair":""},...]
 * }
 */
_processOrderBooksLoops(changes, opt)
{
    // check if we need to unsubscribe
    if (undefined !== changes.unsubscribe)
    {
        _.forEach(changes.unsubscribe, (entry) => {
            switch (entry.entity)
            {
                case 'orderBook':
                    this._unregisterOrderBookLoop(entry.pair);
                    break;
            }
        });
    }
    // check if we need to subscribe
    if (undefined !== changes.subscribe)
    {
        // only if we'be been asked to connect to exchange streams
        if (opt.connect)
        {
            _.forEach(changes.subscribe, (entry) => {
                switch (entry.entity)
                {
                    case 'orderBook':
                        this._registerOrderBookLoop(entry.pair);
                        break;
                }
            });
        }
    }
}

/**
 * Starts an order book loop for a given pair
 *
 * @param {string} pair pair to retrieve order book for
 */
_registerOrderBookLoop(pair)
{
    let loop_id = pair;
    // initialize loop information
    if (undefined === this._emulatedWs.wsOrderBooks.list[loop_id])
    {
        this._emulatedWs.wsOrderBooks.list[loop_id] = {enabled:false, timer:null};
    }
    // we already have a loop
    if (this._emulatedWs.wsOrderBooks.list[loop_id].enabled)
    {
        return;
    }
    if (debug.enabled)
    {
        debug(`Starting '${pair}' order book loop for exchange '${this._exchangeId}'`);
    }
    let self = this;
    let timestamp = Date.now() / 1000.0;
    this._emulatedWs.wsOrderBooks.list[loop_id].enabled = true;
    this._emulatedWs.wsOrderBooks.list[loop_id].timestamp = timestamp;
    this._registerConnection(`orderBook-${loop_id}`);
    const doRequest = function(){
        if (debug.enabled)
        {
            debug(`Retrieving '${pair}' order book for exchange '${self._exchangeId}'`);
        }
        self._exchangeInstance.getOrderBook(pair).then((data) => {
            // loop has been disabled
            if (!self._emulatedWs.wsOrderBooks.list[loop_id].enabled)
            {
                return;
            }
            // we already have a newer loop
            if (self._emulatedWs.wsOrderBooks.list[loop_id].timestamp > timestamp)
            {
                return;
            }
            if (debug.enabled)
            {
                debug(`Got new '${pair}' order book for exchange '${self._exchangeId}'`);
            }
            let evt = {
                exchange:self._exchangeId,
                pair:pair,
                cseq:Date.now(),
                data:{
                    buy:data.buy,
                    sell:data.sell
                }
            }
            self.emit('orderBook', evt);
            // schedule next loop
            self._emulatedWs.wsOrderBooks.list[loop_id].timer = setTimeout(function(){
                doRequest();
            }, self._emulatedWs.wsOrderBooks.period);
        }).catch((e) => {
            // try again after 5s
            let period = 5000;
            if (period > self._emulatedWs.wsOrderBooks.period)
            {
                period = self._emulatedWs.wsOrderBooks.period;
            }
            logger.warn(`Could not retrieve '${pair}' order book for exchange '${self._exchangeId}' : will try again in ${period} ms`);
            if (e instanceof Errors.BaseError)
            {
                logger.warn(JSON.stringify(e));
            }
            else
            {
                logger.warn(e.stack);
            }
            self._emulatedWs.wsOrderBooks.list[loop_id].timer = setTimeout(function(){
                doRequest();
            }, period);
        });
    }
    doRequest();
}

/**
 * Stops order book loop for a given pair
 *
 * @param {string} pair pair to unsubscribe from
 */
_unregisterOrderBookLoop(pair)
{
    let loop_id = pair;
    // loop is already disabled
    if (undefined === this._emulatedWs.wsOrderBooks.list[loop_id] || !this._emulatedWs.wsOrderBooks.list[loop_id].enabled)
    {
        return;
    }
    if (debug.enabled)
    {
        debug(`Stopping '${pair}' order book loop for exchange '${this._exchangeId}'`);
    }
    this._unregisterConnection(`orderBook-${loop_id}`);
    this._emulatedWs.wsOrderBooks.list[loop_id].enabled = false;
    if (null !== this._emulatedWs.wsOrderBooks.list[loop_id].timer)
    {
        clearTimeout(this._emulatedWs.wsOrderBooks.list[loop_id].timer);
        this._emulatedWs.wsOrderBooks.list[loop_id].timer = null;
    }
    this._emulatedWs.wsOrderBooks.list[loop_id].timestamp = Date.now() / 1000.0;
}

//-- trades loops are used to emulate wsTrades when exchange does not support ws

/**
 * @param {object} changes list of changes to process
 * @param {boolean} opt.connect whether or not changes should trigger a connection
 *
 *  Each property (subscribe,unsubscribe) is optional
 *  Entity can be (trades)
 *
 * {
 *    "subscribe":[{"entity":"","pair":""},...],
 *    "unsubscribe":[{"entity":"","pair":""},...]
 * }
 */
_processTradesLoops(changes, opt)
{
    // check if we need to unsubscribe
    if (undefined !== changes.unsubscribe)
    {
        _.forEach(changes.unsubscribe, (entry) => {
            switch (entry.entity)
            {
                case 'trades':
                    this._unregisterTradesLoop(entry.pair);
                    break;
            }
        });
    }
    // check if we need to subscribe
    if (undefined !== changes.subscribe)
    {
        // only if we'be been asked to connect to exchange streams
        if (opt.connect)
        {
            _.forEach(changes.subscribe, (entry) => {
                switch (entry.entity)
                {
                    case 'trades':
                        this._registerTradesLoop(entry.pair);
                        break;
                }
            });
        }
    }
}

/**
 * Starts a trades loop for a given pair
 *
 * @param {string} pair pair to retrieve trades for
 */
_registerTradesLoop(pair)
{
    let loop_id = pair;
    // initialize loop information
    if (undefined === this._emulatedWs.wsTrades.list[loop_id])
    {
        // initialize lastTrade with current timestamp, to only return trades which occur after initialization
        this._emulatedWs.wsTrades.list[loop_id] = {enabled:false, timer:null, lastTrade:{id:null,timestamp:Date.now() / 1000.0}};
    }
    // we already have a loop
    if (this._emulatedWs.wsTrades.list[loop_id].enabled)
    {
        return;
    }
    if (debug.enabled)
    {
        debug(`Starting '${pair}' trades loop for exchange '${this._exchangeId}'`);
    }
    let self = this;
    let timestamp = Date.now() / 1000.0;
    this._emulatedWs.wsTrades.list[loop_id].enabled = true;
    this._emulatedWs.wsTrades.list[loop_id].timestamp = timestamp;
    this._registerConnection(`orderBook-${loop_id}`);
    const doRequest = function(){
        if (debug.enabled)
        {
            debug(`Retrieving '${pair}' trades for exchange '${self._exchangeId}'`);
        }
        self._exchangeInstance.getTrades(pair).then((data) => {
            // loop has been disabled
            if (!self._emulatedWs.wsTrades.list[loop_id].enabled)
            {
                return;
            }
            // we already have a newer loop
            if (self._emulatedWs.wsTrades.list[loop_id].timestamp > timestamp)
            {
                return;
            }
            if (debug.enabled)
            {
                debug(`Got new '${pair}' trades for exchange '${self._exchangeId}'`);
            }
            let evt = {
                exchange:self._exchangeId,
                pair:pair,
                data:[]
            };
            _.forEach(data, (trade) => {
                if (null === self._emulatedWs.wsTrades.list[loop_id].lastTrade)
                {
                    evt.data.push(trade);
                    return;
                }
                // only keep trade if id is greater than previous
                if (null !== self._emulatedWs.wsTrades.list[loop_id].lastTrade.id && null !== trade.id)
                {
                    // ignore trade
                    if (trade.id <= self._emulatedWs.wsTrades.list[loop_id].lastTrade.id)
                    {
                        return;
                    }
                }
                // compare timestamps
                else
                {
                    if (trade.timestamp <= self._emulatedWs.wsTrades.list[loop_id].lastTrade.timestamp)
                    {
                        return;
                    }
                }
                evt.data.push(trade);
            });
            // update last trade with newest one
            if (0 != evt.data.length)
            {
                self._emulatedWs.wsTrades.list[loop_id].lastTrade = {
                    id:evt.data[0].id,
                    timestamp:evt.data[0].timestamp
                }
            }
            self.emit('trades', evt);
            // schedule next loop
            self._emulatedWs.wsTrades.list[loop_id].timer = setTimeout(function(){
                doRequest();
            }, self._emulatedWs.wsTrades.period);
        }).catch((e) => {
            // try again after 5s
            let period = 5000;
            if (period > self._emulatedWs.wsTrades.period)
            {
                period = self._emulatedWs.wsTrades.period;
            }
            logger.warn(`Could not retrieve '${pair}' trades for exchange '${self._exchangeId}' : will try again in ${period} ms`);
            if (e instanceof Errors.BaseError)
            {
                logger.warn(JSON.stringify(e));
            }
            else
            {
                logger.warn(e.stack);
            }
            self._emulatedWs.wsTrades.list[loop_id].timer = setTimeout(function(){
                doRequest();
            }, period);
        });
    }
    doRequest();
}

/**
 * Stops trades loop for a given pair
 *
 * @param {string} pair pair to unsubscribe from
 */
_unregisterTradesLoop(pair)
{
    let loop_id = pair;
    // loop is already disabled
    if (undefined === this._emulatedWs.wsTrades.list[loop_id] || !this._emulatedWs.wsTrades.list[loop_id].enabled)
    {
        return;
    }
    if (debug.enabled)
    {
        debug(`Stopping '${pair}' trades loop for exchange '${this._exchangeId}'`);
    }
    this._unregisterConnection(`trades-${loop_id}`);
    this._emulatedWs.wsTrades.list[loop_id].enabled = false;
    if (null !== this._emulatedWs.wsTrades.list[loop_id].timer)
    {
        clearTimeout(this._emulatedWs.wsTrades.list[loop_id].timer);
        this._emulatedWs.wsTrades.list[loop_id].timer = null;
    }
    this._emulatedWs.wsTrades.list[loop_id].timestamp = Date.now() / 1000.0;
}

}

module.exports = AbstractExchangeSubscriptionManager;
