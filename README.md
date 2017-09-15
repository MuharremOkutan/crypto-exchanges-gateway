# crypto-exchanges-gateway

Your gateway to the world of crypto !

## Disclaimer

This project cannot be considered in any way as trading advice.

Use it at your own risks and be careful with your money ;)

## What it does

* Provides a unified REST API to various exchanges (can be used to automate trading or build bots)
* Handles authentication so that on client side you can concentrate on what really matters
* Implements rate limiting when forwarding requests to remote exchanges
* Provides a REST API to send push notifications using [PushOver](https://pushover.net/api)

## Available Exchanges

Currently supports for following exchanges :

* [Bittrex](https://www.bittrex.com/) (my favorite)
* [Binance](https://www.binance.com/) (nice Chinese exchange with good support)
* [Poloniex](https://www.poloniex.com) ([**worst support**](https://www.reddit.com/r/PoloniexForum/) ever)
* More to come...

Following methods are currently supported :

* Retrieve pairs
* Retrieve tickers
* Retrieve order book
* List open orders
* List closed orders
* Retrieve balances

See [documentation](doc/exchanges/index.adoc) for an overview of each API

## Limitations

Margin trading is not supported (and is unlikely to be)

## Other services

Currently supports following services :

* [CoinMarket](https://coinmarketcap.com/) (see [documentation](doc/coinmarketcap/index.adoc) for an overview of each API)
* [PushOver](https://pushover.net/) (see [documentation](doc/pushover/index.adoc) for an overview of each API)

## Rate limiting

Rate limiting is implemented when required by exchange thanks to [Bottleneck](https://www.npmjs.com/package/bottleneck)

## Installation

Install dependencies

```
npm install
```

Copy sample config

```
cp config/config.sample.json config/config.json
```

Check [documentation](doc/config.adoc) for detailed information on each config section

Start gateway

```
node gateway.js
```

Check which exchanges are enabled

Open http://127.0.0.1:8000/exchanges/ in your browser. You should see JSON content such as below :

```javascript
["binance","bittrex","poloniex"]
```

Check BTC & ETH prices on CoinMarketCap

open http://127.0.0.1:8000/coinmarketcap/tickers?symbols=BTC,ETH in your browser. You should see JSON content such as below :

```javascript
[
    {
        "name":"Bitcoin",
        "symbol":"BTC",
        "rank":1,
        "last_updated":1505472872,
        "convert_currency":null,
        "price_converted":null,
        "24h_volume_converted":null,
        "market_cap_converted":null,
        "price_usd":2991.55,
        "price_btc":1,
        "24h_volume_usd":3303620000,
        "market_cap_usd":49561792636,
        "available_supply":16567262,
        "total_supply":16567262,
        "percent_change_1h":-0.99,
        "percent_change_24h":-18.73,
        "percent_change_7d":-34.09
    },
    {
        "name":"Ethereum",
        "symbol":"ETH",
        "rank":2,
        "last_updated":1505472866,
        "convert_currency":null,
        "price_converted":null,
        "24h_volume_converted":null,
        "market_cap_converted":null,
        "price_usd":199.814,
        "price_btc":0.0660232,
        "24h_volume_usd":1490080000,
        "market_cap_usd":18908734638,
        "available_supply":94631681,
        "total_supply":94631681,
        "percent_change_1h":-3.49,
        "percent_change_24h":-21.93,
        "percent_change_7d":-37.43
    }
]
```

## Dependencies

This project was made possible thanks to following projects :

* [express](https://www.npmjs.com/package/express)
* [body-parser](https://www.npmjs.com/package/body-parser)
* [lodash](https://www.npmjs.com/package/lodash)
* [node.bittrex.api](https://www.npmjs.com/package/node.bittrex.api)
* [binance](https://github.com/aloysius-pgast/binance)
* [poloniex-api-node](https://www.npmjs.com/package/poloniex-api-node)
* [bottleneck](https://www.npmjs.com/package/bottleneck) (for rate limiting)
* [winston](https://www.npmjs.com/package/winston) (for logging)
* [chump](https://www.npmjs.com/package/chump) (for PushOver)

## Donate

This project is a work in progress. If you find it useful, you might consider a little donation ;)

BTC: `163Bu8qMSDoHc1sCatcnyZcpm38Z6PWf6E`

ETH: `0xDEBBEEB9624449D7f2c87497F21722b1731D42a8`

NEO/GAS: `AaQ5xJt4v8GunVchTJXur8WtM8ksprnxRZ`