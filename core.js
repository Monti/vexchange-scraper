const Web3 = require("web3");
const thorify = require("thorify").thorify;
const fs = require("fs");
const _ = require("lodash");

const web3 = thorify(
    new Web3(),
    "https://vechain-api.monti.finance"
);

const DECIMALS = 1000000000000000000n;

// Web3 & Contract Setup
const tokenABI = JSON.parse(fs.readFileSync("./abi/token.json"));
const marketABI = JSON.parse(fs.readFileSync("./abi/exchange.json"));
const factoryABI = JSON.parse(fs.readFileSync("./abi/factory.json"));
const factoryAddress = "0x6A662F91E14312a11a2E35b359427AEf798fD928";

const factoryContract = new web3.eth.Contract(
    factoryABI,
    factoryAddress,
);

// Execution

scrapeAllTokens();

// Functions

async function getAllTokens() {
    let tokenCount = parseInt(await factoryContract.methods.tokenCount().call());
    
    // Fire off async calls and wait for all to resolve
    let callsFinished = false;
    const valueReturned = _.after(tokenCount, () => {
        callsFinished = true;
    });

    let vexchangeTokens = [];

    for (tokenId = 1; tokenId <= tokenCount; tokenId++) {
        factoryContract.methods.getTokenWithId(tokenId).call().then((tokenAddress) => {
            vexchangeTokens.push(tokenAddress);
            valueReturned();
            // factoryContract.methods.getExchange(tokenAddress).call().then((exchangeAddress) => {
            // });
        });
    }

    require("deasync").loopWhile(() => {
        return !callsFinished;
    });

    return vexchangeTokens;
}

async function getAllMarkets() {
    let tokenCount = parseInt(await factoryContract.methods.tokenCount().call());
    
    // Fire off async calls and wait for all to resolve
    let callsFinished = false;
    const valueReturned = _.after(tokenCount, () => {
        callsFinished = true;
    });

    let vexchangeTokens = [];

    for (tokenId = 1; tokenId <= tokenCount; tokenId++) {
        factoryContract.methods.getTokenWithId(tokenId).call().then((tokenAddress) => {
            factoryContract.methods.getExchange(tokenAddress).call().then((exchangeAddress) => {
                vexchangeTokens.push(exchangeAddress);
                valueReturned();
            });
        });
    }

    require("deasync").loopWhile(() => {
        return !callsFinished;
    });

    return vexchangeTokens;
}

async function getTokenDetails(_tokenAddress, _marketAddress) {
    const tokenContract = new web3.eth.Contract(
        tokenABI,
        _tokenAddress,
    );

    let tokenBalance = BigInt(await tokenContract.methods.balanceOf(_marketAddress).call());
    // tokenBalance = parseFloat(parseInt((tokenBalance * 100000n / DECIMALS).toString()) / 100000);    // Convert to decimal
    return [_tokenAddress, tokenBalance]
}

async function getAllScrapableTokens(_market, _ignoreTokenAddress) {
    let scrapableTokens = await getAllTokens();
    let tokensToBalances = {
        marketAddress: _market,
        scrapableTokens: [],
    };

    let callsFinished = false;
    const valueReturned = _.after(scrapableTokens.length - 1, () => {
        callsFinished = true;
    });

    scrapableTokens.forEach((token) => {
        if (token === _ignoreTokenAddress) {
            return;
        }
        
        getTokenDetails(token, _market).then((res) => {
            tokensToBalances.scrapableTokens.push(res);
            valueReturned();
        })
    });

    require("deasync").loopWhile(() => {
        return !callsFinished;
    });

    return tokensToBalances;
}

async function getAllMarketsAndTokens() {
    let markets = await getAllMarkets();

    let marketBalances = [];

    let callsFinished = false;
    const valueReturned = _.after(markets.length, () => {
        callsFinished = true;
    });

    for (const market of markets) {
        console.info("Sending calls for: " + market);
        let avoidToken = await factoryContract.methods.getToken(market).call();

        let result = await getAllScrapableTokens(market, avoidToken);
        marketBalances.push(result);
        valueReturned();
    };

    require("deasync").loopWhile(() => {
        return !callsFinished;
    });
    return marketBalances;
}

// Returns promise
function scrapeToken(_sender, _marketAddress, _tokenToScrape) {
    const marketContract = new web3.eth.Contract(
        marketABI,
        _marketAddress,
    );

    return marketContract.methods.token_scrape(_tokenToScrape, '1', '1', '999999999999').send({
        from: _sender,
        gas: 250000,
        gasPriceCoef: 0,
    });
}

async function scrapeAllTokens() {
    let allBalances = await getAllMarketsAndTokens();

    allBalances.forEach((marketObj) => {
        marketObj.scrapableTokens.forEach((balance) => {
            // console.info(balance);
            if (BigInt(balance[1]) > 0n) {
                console.info("======================================");
                console.info("Non zero balance: ");
                console.info("Market address:   " + marketObj.marketAddress);
                console.info("Token address:    " + balance[0]);
                console.info("Market balance:   " + balance[1] + " (" + 
                parseFloat(parseInt((balance[1] * 100000n / DECIMALS).toString()) / 100000) + ")");
            }
        })
    })
}