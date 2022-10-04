import BigNumber from 'bignumber.js';
import { currency } from '../../components/Common/Ticker';
import {
    organizeUtxosByType,
    getPreliminaryTokensArray,
    finalizeTokensArray,
    finalizeSlpUtxos,
    getTokenStats,
    flattenChronikTxHistory,
    sortAndTrimChronikTxHistory,
    parseChronikTx,
} from 'utils/chronik';
import {
    mockChronikUtxos,
    mockOrganizedUtxosByType,
    mockPreliminaryTokensArray,
    mockPreliminaryTokensArrayClone,
    mockPreliminaryTokensArrayCloneClone,
    mockChronikTxDetailsResponses,
    mockFinalTokenArray,
    mockFinalCachedTokenInfo,
    mockPartialCachedTokenInfo,
    mockPartialChronikTxDetailsResponses,
    mockPreliminarySlpUtxos,
    mockFinalizedSlpUtxos,
    mockTokenInfoById,
} from '../__mocks__/chronikUtxos';
import {
    mockChronikTokenResponse,
    mockGetTokenStatsReturn,
} from '../__mocks__/mockChronikTokenStats';
import {
    mockTxHistoryOfAllAddresses,
    mockFlatTxHistoryNoUnconfirmed,
    mockSortedTxHistoryNoUnconfirmed,
    mockFlatTxHistoryWithUnconfirmed,
    mockSortedFlatTxHistoryWithUnconfirmed,
    mockFlatTxHistoryWithAllUnconfirmed,
    mockSortedFlatTxHistoryWithAllUnconfirmed,
    mockParseTxWallet,
    lambdaIncomingXecTx,
    lambdaOutgoingXecTx,
    lambdaIncomingEtokenTx,
    lambdaOutgoingEtokenTx,
    eTokenGenesisTx,
    receivedEtokenTxNineDecimals,
    anotherMockParseTxWallet,
    txHistoryTokenInfoById,
    mockAirdropTx,
    mockWalletWithPrivateKeys,
    mockSentEncryptedTx,
    mockReceivedEncryptedTx,
    mockTokenBurnTx,
    mockTokenBurnWithDecimalsTx,
} from '../__mocks__/chronikTxHistory';
import { ChronikClient } from 'chronik-client';
import { when } from 'jest-when';
import BCHJS from '@psf/bch-js';

it(`getTokenStats successfully returns a token stats object`, async () => {
    // Initialize chronik
    const chronik = new ChronikClient(
        'https://FakeChronikUrlToEnsureMocksOnly.com',
    );
    const tokenId =
        'bb8e9f685a06a2071d82f757ce19201b4c8e5e96fbe186960a3d65aec83eab20';
    /*
        Mock the API response from chronik.token('tokenId') called
        in getTokenStats()
    */
    chronik.token = jest.fn();
    when(chronik.token)
        .calledWith(tokenId)
        .mockResolvedValue(mockChronikTokenResponse);
    expect(await getTokenStats(chronik, tokenId)).toStrictEqual(
        mockGetTokenStatsReturn,
    );
});

it(`organizeUtxosByType successfully splits a chronikUtxos array into slpUtxos and nonSlpUtxos`, () => {
    expect(organizeUtxosByType(mockChronikUtxos)).toStrictEqual(
        mockOrganizedUtxosByType,
    );

    const resultingOrganizedUtxosObject = organizeUtxosByType(mockChronikUtxos);
    const { nonSlpUtxos, preliminarySlpUtxos } = resultingOrganizedUtxosObject;
    const utxosWithUnexpectedKeys = [];
    for (let i = 0; i < nonSlpUtxos.length; i += 1) {
        // None of the objects in mockOrganizedUtxosByType.nonSlpUtxos should have the `slpToken` key
        // Note: Some may have an `slpMeta` key, if the utxo is from a token burn
        const nonSlpUtxo = nonSlpUtxos[i];
        if ('slpToken' in nonSlpUtxo) {
            console.log(`unexpected nonSlpUtxo!`, nonSlpUtxo);
            utxosWithUnexpectedKeys.push(nonSlpUtxo);
        }
    }
    for (let i = 0; i < preliminarySlpUtxos.length; i += 1) {
        // All of the objects in mockOrganizedUtxosByType.slpUtxos should have the `slpMeta` and `slpToken` keys
        const slpUtxo = preliminarySlpUtxos[i];
        if (!('slpMeta' in slpUtxo) || !('slpToken' in slpUtxo)) {
            console.log(`unexpected slpUtxo!`, slpUtxo);
            utxosWithUnexpectedKeys.push(slpUtxo);
        }
    }
    expect(utxosWithUnexpectedKeys.length).toBe(0);
    // Length of organized utxos should match original
    expect(preliminarySlpUtxos.length + nonSlpUtxos.length).toBe(
        mockChronikUtxos.length,
    );
});

it(`getPreliminaryTokensArray successfully returns an array of all tokenIds and token balances (not yet adjusted for token decimals)`, () => {
    expect(
        getPreliminaryTokensArray(mockOrganizedUtxosByType.preliminarySlpUtxos),
    ).toStrictEqual(mockPreliminaryTokensArray);
});

it(`finalizeTokensArray successfully returns finalTokenArray and cachedTokenInfoById even if no cachedTokenInfoById is provided`, async () => {
    // Initialize chronik
    const chronik = new ChronikClient(
        'https://FakeChronikUrlToEnsureMocksOnly.com',
    );
    /* 
        Mock the API response from chronik.tx('tokenId') called 
        in returnGetTokenInfoChronikPromise -- for each tokenId used
    */
    chronik.tx = jest.fn();
    for (let i = 0; i < mockChronikTxDetailsResponses.length; i += 1) {
        when(chronik.tx)
            .calledWith(mockChronikTxDetailsResponses[i].txid)
            .mockResolvedValue(mockChronikTxDetailsResponses[i]);
    }

    expect(
        await finalizeTokensArray(chronik, mockPreliminaryTokensArray),
    ).toStrictEqual({
        finalTokenArray: mockFinalTokenArray,
        updatedTokenInfoById: mockFinalCachedTokenInfo,
        newTokensToCache: true,
    });
});

it(`finalizeTokensArray successfully returns finalTokenArray and cachedTokenInfoById when called with all token info in cache`, async () => {
    // Initialize chronik
    const chronik = new ChronikClient(
        'https://FakeChronikUrlToEnsureMocksOnly.com',
    );

    expect(
        await finalizeTokensArray(
            chronik,
            mockPreliminaryTokensArrayClone,
            mockFinalCachedTokenInfo,
        ),
    ).toStrictEqual({
        finalTokenArray: mockFinalTokenArray,
        updatedTokenInfoById: mockFinalCachedTokenInfo,
        newTokensToCache: false,
    });
});

it(`updateCachedTokenInfoAndFinalizeTokensArray successfully returns finalTokenArray and cachedTokenInfoById when called with some token info in cache`, async () => {
    // Initialize chronik
    const chronik = new ChronikClient(
        'https://FakeChronikUrlToEnsureMocksOnly.com',
    );
    /* 
        Mock the API response from chronik.tx('tokenId') called 
        in returnGetTokenInfoChronikPromise -- for each tokenId used
    */
    chronik.tx = jest.fn();
    for (let i = 0; i < mockPartialChronikTxDetailsResponses.length; i += 1) {
        when(chronik.tx)
            .calledWith(mockPartialChronikTxDetailsResponses[i].txid)
            .mockResolvedValue(mockPartialChronikTxDetailsResponses[i]);
    }

    expect(
        await finalizeTokensArray(
            chronik,
            mockPreliminaryTokensArrayCloneClone,
            mockPartialCachedTokenInfo,
        ),
    ).toStrictEqual({
        finalTokenArray: mockFinalTokenArray,
        updatedTokenInfoById: mockFinalCachedTokenInfo,
        newTokensToCache: true,
    });
});

it(`finalizeSlpUtxos successfully adds token quantity adjusted for token decimals to preliminarySlpUtxos`, async () => {
    expect(
        await finalizeSlpUtxos(mockPreliminarySlpUtxos, mockTokenInfoById),
    ).toStrictEqual(mockFinalizedSlpUtxos);
});

it(`flattenChronikTxHistory successfully combines the result of getTxHistoryChronik into a single array`, async () => {
    expect(
        await flattenChronikTxHistory(mockTxHistoryOfAllAddresses),
    ).toStrictEqual(mockFlatTxHistoryNoUnconfirmed);
});

it(`sortAndTrimChronikTxHistory successfully orders the result of flattenChronikTxHistory by blockheight and firstSeenTime if all txs are confirmed, and returns a result of expected length`, async () => {
    expect(
        await sortAndTrimChronikTxHistory(mockFlatTxHistoryNoUnconfirmed, 10),
    ).toStrictEqual(mockSortedTxHistoryNoUnconfirmed);
});

it(`sortAndTrimChronikTxHistory successfully orders the result of flattenChronikTxHistory by blockheight and firstSeenTime if some txs are confirmed and others unconfirmed, and returns a result of expected length`, async () => {
    expect(
        await sortAndTrimChronikTxHistory(mockFlatTxHistoryWithUnconfirmed, 10),
    ).toStrictEqual(mockSortedFlatTxHistoryWithUnconfirmed);
});

it(`sortAndTrimChronikTxHistory successfully orders the result of flattenChronikTxHistory by blockheight and firstSeenTime if all txs are unconfirmed, and returns a result of expected length`, async () => {
    expect(
        await sortAndTrimChronikTxHistory(
            mockFlatTxHistoryWithAllUnconfirmed,
            10,
        ),
    ).toStrictEqual(mockSortedFlatTxHistoryWithAllUnconfirmed);
});

it(`Successfully parses an incoming XEC tx`, () => {
    const BCH = new BCHJS({
        restURL: 'https://FakeBchApiUrlToEnsureMocksOnly.com',
    });
    // This function needs to be mocked as bch-js functions that require Buffer types do not work in jest environment
    BCH.Address.hash160ToCash = jest
        .fn()
        .mockReturnValue(
            'bitcoincash:qp89xgjhcqdnzzemts0aj378nfe2mhu9yvll3cvjwd',
        );
    expect(
        parseChronikTx(
            BCH,
            lambdaIncomingXecTx,
            mockParseTxWallet,
            txHistoryTokenInfoById,
        ),
    ).toStrictEqual({
        incoming: true,
        xecAmount: '42',
        originatingHash160: '4e532257c01b310b3b5c1fd947c79a72addf8523',
        isEtokenTx: false,
        legacy: {
            airdropFlag: false,
            airdropTokenId: '',

            decryptionSuccess: false,
            isCashtabMessage: false,
            isEncryptedMessage: false,
            opReturnMessage: '',
            replyAddress: 'ecash:qp89xgjhcqdnzzemts0aj378nfe2mhu9yvxj9nhgg6',
        },
    });
});
it(`Successfully parses an outgoing XEC tx`, () => {
    const BCH = new BCHJS({
        restURL: 'https://FakeBchApiUrlToEnsureMocksOnly.com',
    });
    // This function needs to be mocked as bch-js functions that require Buffer types do not work in jest environment
    BCH.Address.hash160ToCash = jest
        .fn()
        .mockReturnValue(
            'bitcoincash:qpmytrdsakt0axrrlswvaj069nat3p9s7ct4lsf8k9',
        );
    expect(
        parseChronikTx(
            BCH,
            lambdaOutgoingXecTx,
            mockParseTxWallet,
            txHistoryTokenInfoById,
        ),
    ).toStrictEqual({
        incoming: false,
        xecAmount: '222',
        originatingHash160: '76458db0ed96fe9863fc1ccec9fa2cfab884b0f6',
        isEtokenTx: false,
        legacy: {
            airdropFlag: false,
            airdropTokenId: '',

            decryptionSuccess: false,
            isCashtabMessage: false,
            isEncryptedMessage: false,
            opReturnMessage: '',
            replyAddress: 'ecash:qpmytrdsakt0axrrlswvaj069nat3p9s7cjctmjasj',
        },
    });
});
it(`Successfully parses an incoming eToken tx`, () => {
    const BCH = new BCHJS();
    // This function needs to be mocked as bch-js functions that require Buffer types do not work in jest environment
    BCH.Address.hash160ToCash = jest
        .fn()
        .mockReturnValue(
            'bitcoincash:qp89xgjhcqdnzzemts0aj378nfe2mhu9yvll3cvjwd',
        );
    expect(
        parseChronikTx(
            BCH,
            lambdaIncomingEtokenTx,
            mockParseTxWallet,
            txHistoryTokenInfoById,
        ),
    ).toStrictEqual({
        incoming: true,
        xecAmount: '5.46',
        isEtokenTx: true,
        isTokenBurn: false,
        originatingHash160: '4e532257c01b310b3b5c1fd947c79a72addf8523',
        slpMeta: {
            tokenId:
                '4bd147fc5d5ff26249a9299c46b80920c0b81f59a60e05428262160ebee0b0c3',
            tokenType: 'FUNGIBLE',
            txType: 'SEND',
        },
        genesisInfo: {
            decimals: 0,
            success: true,
            tokenDocumentHash: '',
            tokenDocumentUrl:
                'https://www.who.int/emergencies/diseases/novel-coronavirus-2019/covid-19-vaccines',
            tokenId:
                '4bd147fc5d5ff26249a9299c46b80920c0b81f59a60e05428262160ebee0b0c3',
            tokenName: 'Covid19 Lifetime Immunity',
            tokenTicker: 'NOCOVID',
        },
        etokenAmount: '12',
        legacy: {
            airdropFlag: false,
            airdropTokenId: '',

            decryptionSuccess: false,
            isCashtabMessage: false,
            isEncryptedMessage: false,
            opReturnMessage: '',
            replyAddress: 'ecash:qp89xgjhcqdnzzemts0aj378nfe2mhu9yvxj9nhgg6',
        },
    });
});
it(`Successfully parses an outgoing eToken tx`, () => {
    const BCH = new BCHJS({
        restURL: 'https://FakeBchApiUrlToEnsureMocksOnly.com',
    });
    // This function needs to be mocked as bch-js functions that require Buffer types do not work in jest environment
    BCH.Address.hash160ToCash = jest
        .fn()
        .mockReturnValue(
            'bitcoincash:qpmytrdsakt0axrrlswvaj069nat3p9s7ct4lsf8k9',
        );
    expect(
        parseChronikTx(
            BCH,
            lambdaOutgoingEtokenTx,
            mockParseTxWallet,
            txHistoryTokenInfoById,
        ),
    ).toStrictEqual({
        incoming: false,
        xecAmount: '5.46',
        isEtokenTx: true,
        isTokenBurn: false,
        originatingHash160: '76458db0ed96fe9863fc1ccec9fa2cfab884b0f6',
        slpMeta: {
            tokenId:
                '4bd147fc5d5ff26249a9299c46b80920c0b81f59a60e05428262160ebee0b0c3',
            tokenType: 'FUNGIBLE',
            txType: 'SEND',
        },
        genesisInfo: {
            decimals: 0,
            success: true,
            tokenDocumentHash: '',
            tokenDocumentUrl:
                'https://www.who.int/emergencies/diseases/novel-coronavirus-2019/covid-19-vaccines',
            tokenId:
                '4bd147fc5d5ff26249a9299c46b80920c0b81f59a60e05428262160ebee0b0c3',
            tokenName: 'Covid19 Lifetime Immunity',
            tokenTicker: 'NOCOVID',
        },
        etokenAmount: '17',
        legacy: {
            airdropFlag: false,
            airdropTokenId: '',

            decryptionSuccess: false,
            isCashtabMessage: false,
            isEncryptedMessage: false,
            opReturnMessage: '',
            replyAddress: 'ecash:qpmytrdsakt0axrrlswvaj069nat3p9s7cjctmjasj',
        },
    });
});
it(`Successfully parses a genesis eToken tx`, () => {
    const BCH = new BCHJS({
        restURL: 'https://FakeBchApiUrlToEnsureMocksOnly.com',
    });
    // This function needs to be mocked as bch-js functions that require Buffer types do not work in jest environment
    BCH.Address.hash160ToCash = jest
        .fn()
        .mockReturnValue(
            'bitcoincash:qz2708636snqhsxu8wnlka78h6fdp77ar5ulhz04hr',
        );
    expect(
        parseChronikTx(
            BCH,
            eTokenGenesisTx,
            anotherMockParseTxWallet,
            txHistoryTokenInfoById,
        ),
    ).toStrictEqual({
        incoming: false,
        xecAmount: '0',
        originatingHash160: '95e79f51d4260bc0dc3ba7fb77c7be92d0fbdd1d',
        isEtokenTx: true,
        isTokenBurn: false,
        etokenAmount: '777.7777777',
        slpMeta: {
            tokenType: 'FUNGIBLE',
            txType: 'GENESIS',
            tokenId:
                'cf601c56b58bc05a39a95374a4a865f0a8b56544ea937b30fb46315441717c50',
        },
        genesisInfo: {
            decimals: 7,
            success: true,
            tokenDocumentHash: '',
            tokenDocumentUrl: 'https://cashtab.com/',
            tokenId:
                'cf601c56b58bc05a39a95374a4a865f0a8b56544ea937b30fb46315441717c50',
            tokenName: 'UpdateTest',
            tokenTicker: 'UDT',
        },
        legacy: {
            airdropFlag: false,
            airdropTokenId: '',
            opReturnMessage: '',
            isCashtabMessage: false,
            isEncryptedMessage: false,
            decryptionSuccess: false,
            replyAddress: 'ecash:qz2708636snqhsxu8wnlka78h6fdp77ar59jrf5035',
        },
    });
});
it(`Successfully parses a received eToken tx with 9 decimal places`, () => {
    const BCH = new BCHJS({
        restURL: 'https://FakeBchApiUrlToEnsureMocksOnly.com',
    });
    // This function needs to be mocked as bch-js functions that require Buffer types do not work in jest environment
    BCH.Address.hash160ToCash = jest
        .fn()
        .mockReturnValue(
            'bitcoincash:qp89xgjhcqdnzzemts0aj378nfe2mhu9yvll3cvjwd',
        );
    expect(
        parseChronikTx(
            BCH,
            receivedEtokenTxNineDecimals,
            anotherMockParseTxWallet,
            txHistoryTokenInfoById,
        ),
    ).toStrictEqual({
        incoming: true,
        xecAmount: '5.46',
        originatingHash160: '4e532257c01b310b3b5c1fd947c79a72addf8523',
        isEtokenTx: true,
        isTokenBurn: false,
        etokenAmount: '0.123456789',
        slpMeta: {
            tokenType: 'FUNGIBLE',
            txType: 'SEND',
            tokenId:
                'acba1d7f354c6d4d001eb99d31de174e5cea8a31d692afd6e7eb8474ad541f55',
        },
        genesisInfo: {
            decimals: 9,
            success: true,
            tokenDocumentHash: '',
            tokenDocumentUrl: 'https://cashtabapp.com/',
            tokenId:
                'acba1d7f354c6d4d001eb99d31de174e5cea8a31d692afd6e7eb8474ad541f55',
            tokenName: 'CashTabBits',
            tokenTicker: 'CTB',
        },
        legacy: {
            airdropFlag: false,
            airdropTokenId: '',
            opReturnMessage: '',
            isCashtabMessage: false,
            isEncryptedMessage: false,
            decryptionSuccess: false,
            replyAddress: 'ecash:qp89xgjhcqdnzzemts0aj378nfe2mhu9yvxj9nhgg6',
        },
    });
});
it(`Correctly parses a received airdrop transaction`, () => {
    const BCH = new BCHJS({
        restURL: 'https://FakeBchApiUrlToEnsureMocksOnly.com',
    });
    // This function needs to be mocked as bch-js functions that require Buffer types do not work in jest environment
    BCH.Address.hash160ToCash = jest
        .fn()
        .mockReturnValue(
            'bitcoincash:qp36z7k8xt7k4l5xnxeypg5mfqeyvvyduukc069ng6',
        );
    expect(
        parseChronikTx(
            BCH,
            mockAirdropTx,
            anotherMockParseTxWallet,
            txHistoryTokenInfoById,
        ),
    ).toStrictEqual({
        incoming: true,
        xecAmount: '5.69',
        originatingHash160: '63a17ac732fd6afe8699b240a29b483246308de7',
        isEtokenTx: false,
        legacy: {
            airdropFlag: true,
            airdropTokenId:
                'bdb3b4215ca0622e0c4c07655522c376eaa891838a82f0217fa453bb0595a37c',
            opReturnMessage:
                'evc token service holders air drop🥇🌐🥇❤👌🛬🛬🍗🤴',
            isCashtabMessage: true,
            isEncryptedMessage: false,
            decryptionSuccess: false,
            replyAddress: 'ecash:qp36z7k8xt7k4l5xnxeypg5mfqeyvvyduu04m37fwd',
        },
    });
});

it(`Correctly parses a sent encyrpted message transaction`, () => {
    const BCH = new BCHJS({
        restURL: 'https://FakeBchApiUrlToEnsureMocksOnly.com',
    });
    // This function needs to be mocked as bch-js functions that require Buffer types do not work in jest environment
    BCH.Address.hash160ToCash = jest
        .fn()
        .mockReturnValue(
            'bitcoincash:qrhxmjw5p72a3cgx5cect3h63q5erw0gfc4l80hyqu',
        );
    expect(
        parseChronikTx(
            BCH,
            mockSentEncryptedTx,
            mockWalletWithPrivateKeys,
            txHistoryTokenInfoById,
        ),
    ).toStrictEqual({
        incoming: false,
        xecAmount: '12',
        originatingHash160: 'ee6dc9d40f95d8e106a63385c6fa882991b9e84e',
        isEtokenTx: false,
        legacy: {
            airdropFlag: false,
            airdropTokenId: '',
            opReturnMessage: 'Only the message recipient can view this',
            isCashtabMessage: true,
            isEncryptedMessage: true,
            decryptionSuccess: false,
            replyAddress: 'ecash:qrhxmjw5p72a3cgx5cect3h63q5erw0gfcvjnyv7xt',
        },
    });
});
it(`Correctly parses a received encyrpted message transaction`, () => {
    const BCH = new BCHJS({
        restURL: 'https://FakeBchApiUrlToEnsureMocksOnly.com',
    });
    // This function needs to be mocked as bch-js functions that require Buffer types do not work in jest environment
    BCH.Address.hash160ToCash = jest
        .fn()
        .mockReturnValue(
            'bitcoincash:qp89xgjhcqdnzzemts0aj378nfe2mhu9yvll3cvjwd',
        );
    expect(
        parseChronikTx(
            BCH,
            mockReceivedEncryptedTx,
            mockWalletWithPrivateKeys,
            txHistoryTokenInfoById,
        ),
    ).toStrictEqual({
        incoming: true,
        xecAmount: '11',
        originatingHash160: '4e532257c01b310b3b5c1fd947c79a72addf8523',
        isEtokenTx: false,
        legacy: {
            airdropFlag: false,
            airdropTokenId: '',
            opReturnMessage: 'Test encrypted message',
            isCashtabMessage: true,
            isEncryptedMessage: true,
            decryptionSuccess: true,
            replyAddress: 'ecash:qp89xgjhcqdnzzemts0aj378nfe2mhu9yvxj9nhgg6',
        },
    });
});

it(`Correctly parses a token burn transaction`, () => {
    const BCH = new BCHJS({
        restURL: 'https://FakeBchApiUrlToEnsureMocksOnly.com',
    });
    // This function needs to be mocked as bch-js functions that require Buffer types do not work in jest environment
    BCH.Address.hash160ToCash = jest
        .fn()
        .mockReturnValue(
            'bitcoincash:qz2708636snqhsxu8wnlka78h6fdp77ar5ulhz04hr',
        );
    expect(
        parseChronikTx(
            BCH,
            mockTokenBurnTx,
            anotherMockParseTxWallet,
            txHistoryTokenInfoById,
        ),
    ).toStrictEqual({
        incoming: false,
        xecAmount: '0',
        originatingHash160: '95e79f51d4260bc0dc3ba7fb77c7be92d0fbdd1d',
        isEtokenTx: true,
        isTokenBurn: true,
        etokenAmount: '12',
        slpMeta: {
            tokenType: 'FUNGIBLE',
            txType: 'SEND',
            tokenId:
                '4db25a4b2f0b57415ce25fab6d9cb3ac2bbb444ff493dc16d0615a11ad06c875',
        },
        genesisInfo: {
            tokenTicker: 'LVV',
            tokenName: 'Lambda Variant Variants',
            tokenDocumentUrl: 'https://cashtabapp.com/',
            tokenDocumentHash: '',
            decimals: 0,
            tokenId:
                '4db25a4b2f0b57415ce25fab6d9cb3ac2bbb444ff493dc16d0615a11ad06c875',
            success: true,
        },
        legacy: {
            airdropFlag: false,
            airdropTokenId: '',
            opReturnMessage: '',
            isCashtabMessage: false,
            isEncryptedMessage: false,
            decryptionSuccess: false,
            replyAddress: 'ecash:qz2708636snqhsxu8wnlka78h6fdp77ar59jrf5035',
        },
    });
});
it(`Correctly parses a token burn transaction with decimal places`, () => {
    const BCH = new BCHJS({
        restURL: 'https://FakeBchApiUrlToEnsureMocksOnly.com',
    });
    // This function needs to be mocked as bch-js functions that require Buffer types do not work in jest environment
    BCH.Address.hash160ToCash = jest
        .fn()
        .mockReturnValue(
            'bitcoincash:qz2708636snqhsxu8wnlka78h6fdp77ar5ulhz04hr',
        );
    expect(
        parseChronikTx(
            BCH,
            mockTokenBurnWithDecimalsTx,
            anotherMockParseTxWallet,
            txHistoryTokenInfoById,
        ),
    ).toStrictEqual({
        incoming: false,
        xecAmount: '0',
        originatingHash160: '95e79f51d4260bc0dc3ba7fb77c7be92d0fbdd1d',
        isEtokenTx: true,
        etokenAmount: '0.1234567',
        isTokenBurn: true,
        slpMeta: {
            tokenType: 'FUNGIBLE',
            txType: 'SEND',
            tokenId:
                '7443f7c831cdf2b2b04d5f0465ed0bcf348582675b0e4f17906438c232c22f3d',
        },
        genesisInfo: {
            tokenTicker: 'WDT',
            tokenName:
                'Test Token With Exceptionally Long Name For CSS And Style Revisions',
            tokenDocumentUrl:
                'https://www.ImpossiblyLongWebsiteDidYouThinkWebDevWouldBeFun.org',
            tokenDocumentHash:
                '85b591c15c9f49531e39fcfeb2a5a26b2bd0f7c018fb9cd71b5d92dfb732d5cc',
            decimals: 7,
            tokenId:
                '7443f7c831cdf2b2b04d5f0465ed0bcf348582675b0e4f17906438c232c22f3d',
            success: true,
        },
        legacy: {
            airdropFlag: false,
            airdropTokenId: '',
            opReturnMessage: '',
            isCashtabMessage: false,
            isEncryptedMessage: false,
            decryptionSuccess: false,
            replyAddress: 'ecash:qz2708636snqhsxu8wnlka78h6fdp77ar59jrf5035',
        },
    });
});
