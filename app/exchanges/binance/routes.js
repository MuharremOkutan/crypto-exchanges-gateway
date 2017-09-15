"use strict";
const util = require('util');
const RequestHelper = require('../../request-helper');
const pairFinder = require('../../pair-finder');

module.exports = function(app, bodyParser, config) {

if (!config.exchanges.binance.enabled)
{
    return;
}

const ExchangeClass = require('./exchange');
const exchange = new ExchangeClass(config);

let getPairs = function(){
    return exchange.pairs();
}
pairFinder.register('binance', getPairs);

/**
 * Returns tickers for a list of pairs
 *
 * @param {string} opt.outputFormat if value is 'exchange' AND opt.pairs only contain one pair, response returned will be returned untouched (will be forced to 'custom' if we have more than one pair or no pair)
 * @param {string} pairs pairs to retrieve ticker for (optional)
 */
app.get('/exchanges/binance/tickers', (req, res) => {
    let opt = {outputFormat:'custom',pairs:[]};
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
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    exchange.tickers(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            if (undefined === err.msg)
            {
                res.status(503).send({origin:"remote",error:err});
            }
            else
            {
                res.status(503).send({origin:"remote",error:err.msg});
            }
        });
});

/**
 * Returns ticker for an existing pair
 *
 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {string} pair pair to retrieve ticker for
 */
app.get('/exchanges/binance/tickers/:pair', (req, res) => {
    let opt = {outputFormat:'custom'};
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
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
            if (undefined === err.msg)
            {
                res.status(503).send({origin:"remote",error:err});
            }
            else
            {
                res.status(503).send({origin:"remote",error:err.msg});
            }
        });
});

/**
 * Retrieves existing pairs
 */
app.get('/exchanges/binance/pairs', (req, res) => {
    let opt = {};
    exchange.pairs(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            if (undefined === err.msg)
            {
                res.status(503).send({origin:"remote",error:err});
            }
            else
            {
                res.status(503).send({origin:"remote",error:err.msg});
            }
        });
});

/**
 * Returns order book for a given pair
 *
 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {string} pair pair to retrieve order book for
 * @param {integer} limit how many entries to retrieve (optional, default = 100, max = 100) (must be a )
 */
app.get('/exchanges/binance/orderBooks/:pair', (req, res) => {
    let opt = {outputFormat:'custom', limit:100};
    if (undefined === req.params.pair || '' == req.params.pair)
    {
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'pair'"});
        return;
    }
    opt.pair = req.params.pair;
    if (undefined != req.query.limit)
    {
        let limit = parseInt(req.query.limit);
        if (isNaN(limit) || limit <= 0)
        {
            res.status(400).send({origin:"gateway",error:util.format("Parameter 'limit' should be an integer > 0 : value = '%s'", req.query.limit)});
            return;
        }
        opt.limit = limit;
    }
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
            if (undefined === err.msg)
            {
                res.status(503).send({origin:"remote",error:err});
            }
            else
            {
                res.status(503).send({origin:"remote",error:err.msg});
            }
        });
});

//-- below routes require valid key/secret
if ('' === config.exchanges.binance.key || '' === config.exchanges.binance.secret)
{
    return;
}

/**
 * Returns open orders
 *
 * @param {string} opt.outputFormat if value is 'exchange' AND opt.pairs only contain one pair, response returned will be returned untouched (will be forced to 'custom' if we have more than one pair or no pair)
 * @param {string} pairs pairs to retrieve open orders for (optional)
 */
app.get('/exchanges/binance/openOrders', (req, res) => {
    let opt = {pairs:[]};
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
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    exchange.openOrders(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            if (undefined === err.msg)
            {
                res.status(503).send({origin:"remote",error:err});
            }
            else
            {
                res.status(503).send({origin:"remote",error:err.msg});
            }
        });
});

/**
 * Returns a single open order
 *
 * @param {string} orderNumber unique identifier of the order to return
 * @param {string} pair pair for this order (optional)
 */
app.get('/exchanges/binance/openOrders/:orderNumber', (req, res) => {
    let opt = {outputFormat:'custom'}
    if (undefined === req.params.orderNumber || '' == req.params.orderNumber)
    {
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'orderNumber'"});
        return;
    }
    opt.orderNumber = req.params.orderNumber;
    if (undefined !== req.query.pair && '' != req.query.pair)
    {
        opt.pair = req.query.pair;
    }
    exchange.openOrder(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            if (undefined === err.msg)
            {
                res.status(503).send({origin:"remote",error:err});
            }
            else
            {
                res.status(503).send({origin:"remote",error:err.msg});
            }
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
app.post('/exchanges/binance/openOrders', bodyParser, (req, res) => {
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
            if (undefined === err.msg)
            {
                res.status(503).send({origin:"remote",error:err});
            }
            else
            {
                res.status(503).send({origin:"remote",error:err.msg});
            }
        });
});

/**
 * Cancels an existing order
 *
 * @param {string} outputFormat (custom|exchange) if value is 'exchange' result returned by remote exchange will be returned untouched (optional, default = 'custom')
 * @param {string} orderNumber unique identifier of the order to cancel
 * @param {string} pair pair for this order (optional)
 */
app.delete('/exchanges/binance/openOrders/:orderNumber', (req, res) => {
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
    if (undefined !== req.query.pair && '' != req.query.pair)
    {
        opt.pair = req.query.pair;
    }
    //-- create order
    exchange.cancelOrder(opt)
        .then(function(data) {
            console.error(data);
            res.send(data);
        })
        .catch(function(err)
        {
            if (undefined === err.msg)
            {
                res.status(503).send({origin:"remote",error:err});
            }
            else
            {
                res.status(503).send({origin:"remote",error:err.msg});
            }
        });
});

/**
 * Returns closed orders
 *
 * @param {string} opt.outputFormat if value is 'exchange' AND opt.pairs only contain one pair, response returned will be returned untouched (will be forced to 'custom' if we have more than one pair or no pair)
 * @param {string} pairs pairs to retrieve closed orders for (optional, will be ignored if 'outputFormat' is 'exchange')
 */
app.get('/exchanges/binance/closedOrders', (req, res) => {
    let opt = {pairs:[]};
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
    if ('exchange' == req.query.outputFormat)
    {
        opt.outputFormat = 'exchange';
    }
    exchange.closedOrders(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            if (undefined === err.msg)
            {
                res.status(503).send({origin:"remote",error:err});
            }
            else
            {
                res.status(503).send({origin:"remote",error:err.msg});
            }
        });
});

/**
 * Returns a single closed order
 *
 * @param {string} orderNumber unique identifier of the order to return
 * @param {string} pair pair for this order (optional)
 */
app.get('/exchanges/binance/closedOrders/:orderNumber', (req, res) => {
    let opt = {outputFormat:'custom'};
    if (undefined === req.params.orderNumber || '' == req.params.orderNumber)
    {
        res.status(400).send({origin:"gateway",error:"Missing url parameter 'orderNumber'"});
        return;
    }
    if (undefined !== req.query.pair && '' != req.query.pair)
    {
        opt.pair = req.query.pair;
    }
    opt.orderNumber = req.params.orderNumber;
    exchange.closedOrder(opt)
        .then(function(data) {
            res.send(data);
        })
        .catch(function(err)
        {
            if (undefined === err.msg)
            {
                res.status(503).send({origin:"remote",error:err});
            }
            else
            {
                res.status(503).send({origin:"remote",error:err.msg});
            }
        });
});

/**
 * Retrieves all balances
 */
app.get('/exchanges/binance/balances', (req, res) => {
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
            if (undefined === err.msg)
            {
                res.status(503).send({origin:"remote",error:err});
            }
            else
            {
                res.status(503).send({origin:"remote",error:err.msg});
            }
        });
});

/**
 * Retrieves balance for a single currency
 *
 * @param {string} currency currency to retrieve balance for
 *
 */
app.get('/exchanges/binance/balances/:currency', (req, res) => {
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
            if (undefined === err.msg)
            {
                res.status(503).send({origin:"remote",error:err});
            }
            else
            {
                res.status(503).send({origin:"remote",error:err.msg});
            }
        });
});

};