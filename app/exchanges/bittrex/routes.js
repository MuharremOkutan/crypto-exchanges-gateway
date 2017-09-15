"use strict";
const util = require('util');
const RequestHelper = require('../../request-helper');
const pairFinder = require('../../pair-finder');

module.exports = function(app, bodyParser, config) {

if (!config.exchanges.bittrex.enabled)
{
    return;
}

const ExchangeClass = require('./exchange');
const exchange = new ExchangeClass(config);

let getPairs = function(){
    return exchange.pairs();
}
pairFinder.register('bittrex', getPairs);

/**
 * Returns tickers for all pairs (or a list of pairs)
 *
 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {string} pairs pairs to retrieve ticker for (optional, will be ignored if 'outputFormat' is 'exchange')
 */
app.get('/exchanges/bittrex/tickers', (req, res) => {
    let opt = {outputFormat:'custom'}
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    if ('custom' == opt.outputFormat)
    {
        if (undefined !== req.query.pairs && '' != req.query.pairs)
        {
            // support both array and comma-separated string
            if (Array.isArray(req.query.pairs))
            {
                opt.pairs = req.query.pairs;
            }
            else
            {
                opt.pairs = req.query.pairs.split(',');
            }
        }
    }
    exchange.tickers(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

/**
 * Returns ticker for an existing pair
 *
 * @param {string} pair pair to retrieve ticker for
 */
app.get('/exchanges/bittrex/tickers/:pair', (req, res) => {
    let opt = {outputFormat:'custom'};
    if (undefined === req.params.pair || '' == req.params.pair)
    {
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'pair'"});
        return;
    }
    opt.pairs = [req.params.pair];
    exchange.tickers(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

/**
 * Retrieves existing pairs
 */
app.get('/exchanges/bittrex/pairs', (req, res) => {
    let opt = {};
    exchange.pairs(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

/**
 * Returns order book for a given pair
 *
 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {string} pair pair to retrieve order book for
 */
app.get('/exchanges/bittrex/orderBooks/:pair', (req, res) => {
    let opt = {outputFormat:'custom'};
    if (undefined === req.params.pair || '' == req.params.pair)
    {
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'pair'"});
        return;
    }
    opt.pair = req.params.pair;
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    exchange.orderBook(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

//-- below routes require valid key/secret
if ('' === config.exchanges.bittrex.key || '' === config.exchanges.bittrex.secret)
{
    return;
}

/**
 * Returns open orders
 *
 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {string} pairs pairs to retrieve open orders for (optional, will be ignored if 'outputFormat' is 'exchange')
 */
app.get('/exchanges/bittrex/openOrders', (req, res) => {

    let opt = {outputFormat:'custom'}
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    if ('custom' == opt.outputFormat)
    {
        if (undefined !== req.query.pairs && '' != req.query.pairs)
        {
            // support both array and comma-separated string
            if (Array.isArray(req.query.pairs))
            {
                opt.pairs = req.query.pairs;
            }
            else
            {
                opt.pairs = req.query.pairs.split(',');
            }
        }
    }
    exchange.openOrders(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

/**
 * Returns a single open order
 *
 * @param {string} orderNumber unique identifier of the order to return
 */
app.get('/exchanges/bittrex/openOrders/:orderNumber', (req, res) => {
    let opt = {outputFormat:'custom'}
    if (undefined === req.params.orderNumber || '' == req.params.orderNumber)
    {
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'orderNumber'"});
        return;
    }
    opt.orderNumber = req.params.orderNumber;
    exchange.openOrders(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

/**
 * Create a new order
 *
 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {string} orderType (buy|sell)
 * @param {string} pair pair to create order for (expected format depends on 'inputFormat' parameter
 * @param {float} targetRate rate to use for order
 * @param {float} quantity quantity to buy/sell
 */
app.post('/exchanges/bittrex/openOrders', bodyParser, (req, res) => {
    let opt = {outputFormat:'custom'}
    let value = RequestHelper.getParam(req, 'outputFormat');
    if ('exchange' == value)
    {
        opt.outputFormat = 'exchange';
    }
    //-- order type
    value = RequestHelper.getParam(req, 'orderType');
    if (undefined === value || '' == value)
    {
        res.status(400).send({origin:"gateway",error:"Missing query parameter 'orderType'"});
        return;
    }
    if ('buy' != value && 'sell' != value)
    {
        res.status(400).send({origin:"gateway",error:util.format("Query parameter 'orderType' is not valid : value = '%s'", value)});
        return;
    }
    opt.orderType = value;
    //-- pair
    value = RequestHelper.getParam(req, 'pair');
    if (undefined === value || '' == value)
    {
        res.status(400).send({origin:"gateway",error:"Missing query parameter 'pair'"});
        return;
    }
    opt.pair = value;
    //-- targetRate
    value = RequestHelper.getParam(req, 'targetRate');
    if (undefined === value || '' == value)
    {
        res.status(400).send({origin:"gateway",error:"Missing query parameter 'targetRate'"});
        return;
    }
    let targetRate = parseFloat(value);
    if (isNaN(targetRate) || targetRate <= 0)
    {
        res.status(400).send({origin:"gateway",error:util.format("Query parameter 'targetRate' should be a float > 0 : value = '%s'", value)});
        return;
    }
    opt.targetRate = value;
    //-- quantity
    value = RequestHelper.getParam(req, 'quantity');
    if (undefined === value || '' == value)
    {
        res.status(400).send({origin:"gateway",error:"Missing query parameter 'quantity'"});
        return;
    }
    let quantity = parseFloat(value);
    if (isNaN(quantity) || quantity <= 0)
    {
        res.status(400).send({origin:"gateway",error:util.format("Query parameter 'quantity' should be a float > 0 : value = '%s'", value)});
        return;
    }
    opt.quantity = value;
    //-- create order
    exchange.addOrder(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

/**
 * Cancels an existing order
 *
 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {string} orderNumber unique identifier of the order to cancel
 */
app.delete('/exchanges/bittrex/openOrders/:orderNumber', (req, res) => {
    let opt = {outputFormat:'custom'}
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    if (undefined === req.params.orderNumber || '' == req.params.orderNumber)
    {
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'orderNumber'"});
        return;
    }
    opt.orderNumber = req.params.orderNumber;
    //-- create order
    exchange.cancelOrder(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

/**
 * Returns closed orders
 *
 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {string} pairs pairs to retrieve closed orders for (optional, will be ignored if 'outputFormat' is 'exchange')
 */
app.get('/exchanges/bittrex/closedOrders', (req, res) => {
    let opt = {outputFormat:'custom'};
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    if ('custom' == opt.outputFormat)
    {
        if (undefined !== req.query.pairs && '' != req.query.pairs)
        {
            // support both array and comma-separated string
            if (Array.isArray(req.query.pairs))
            {
                opt.pairs = req.query.pairs;
            }
            else
            {
                opt.pairs = req.query.pairs.split(',');
            }
        }
    }
    exchange.closedOrders(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

/**
 * Returns a single closed order
 *
 * @param {string} orderNumber unique identifier of the order to return
 */
app.get('/exchanges/bittrex/closedOrders/:orderNumber', (req, res) => {
    let opt = {outputFormat:'custom'};
    if (undefined === req.params.orderNumber || '' == req.params.orderNumber)
    {
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'orderNumber'"});
        return;
    }
    opt.orderNumber = req.params.orderNumber;
    exchange.closedOrders(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

/**
 * Retrieves all balances
 */
app.get('/exchanges/bittrex/balances', (req, res) => {
    let opt = {outputFormat:'custom'};
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    exchange.balances(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

/**
 * Retrieves balance for a single currency
 *
 * @param {string} currency currency to retrieve balance for
 *
 */
app.get('/exchanges/bittrex/balances/:currency', (req, res) => {
    let opt = {outputFormat:'custom'};
    if (undefined === req.params.currency || '' == req.params.currency)
    {
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'currency'"});
        return;
    }
    opt.currency = req.params.currency;
    exchange.balances(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            res.status(503).send({origin:"remote",error:err});
        });
});

};