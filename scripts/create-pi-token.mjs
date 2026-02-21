import * as StellarSdk from "stellar-sdk";

const HORIZON_URL = process.env.PI_HORIZON_URL || "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = process.env.PI_NETWORK_PASSPHRASE || "Pi Testnet";

const requireEnv = (name) => {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const issuerSecret = requireEnv("PI_ISSUER_SECRET");
const distributorSecret = requireEnv("PI_DISTRIBUTOR_SECRET");
const tokenCode = String(process.env.PI_TOKEN_CODE || "OpenPay").trim();
const mintAmount = String(process.env.PI_MINT_AMOUNT || "14019432151.014").trim();
const homeDomain = String(process.env.PI_HOME_DOMAIN || "openpaytestnet.vercel.app").trim();
const expectedIssuerPublic = String(process.env.PI_ISSUER_PUBLIC || "").trim();

if (!/^[a-zA-Z0-9]{1,12}$/.test(tokenCode)) {
  throw new Error("PI_TOKEN_CODE must be alphanumeric and 1..12 chars");
}
if (!/^\d+(\.\d+)?$/.test(mintAmount)) {
  throw new Error("PI_MINT_AMOUNT must be a positive numeric string");
}
if (!homeDomain) {
  throw new Error("PI_HOME_DOMAIN cannot be empty");
}

const server = new StellarSdk.Horizon.Server(HORIZON_URL);
const issuerKeypair = StellarSdk.Keypair.fromSecret(issuerSecret);
const distributorKeypair = StellarSdk.Keypair.fromSecret(distributorSecret);

if (expectedIssuerPublic && issuerKeypair.publicKey() !== expectedIssuerPublic) {
  throw new Error("PI_ISSUER_SECRET does not match PI_ISSUER_PUBLIC");
}

const customAsset = new StellarSdk.Asset(tokenCode, issuerKeypair.publicKey());

const getBaseFee = async () => {
  try {
    return await server.fetchBaseFee();
  } catch {
    const ledgerResp = await server.ledgers().order("desc").limit(1).call();
    return Number(ledgerResp.records?.[0]?.base_fee_in_stroops || 100000);
  }
};

const hasTrustline = (account) => {
  return account.balances.some((b) => b.asset_code === tokenCode && b.asset_issuer === issuerKeypair.publicKey());
};

const submit = async (tx, signer) => {
  tx.sign(signer);
  return await server.submitTransaction(tx);
};

const buildTx = async (account) => {
  const baseFee = await getBaseFee();
  return new StellarSdk.TransactionBuilder(account, {
    fee: String(baseFee),
    networkPassphrase: NETWORK_PASSPHRASE,
    timebounds: await server.fetchTimebounds(120),
  });
};

(async () => {
  console.log("Creating/confirming token on Pi Testnet...");
  console.log(`Issuer: ${issuerKeypair.publicKey()}`);
  console.log(`Distributor: ${distributorKeypair.publicKey()}`);
  console.log(`Asset: ${tokenCode}`);

  const distributorAccount = await server.loadAccount(distributorKeypair.publicKey());
  if (!hasTrustline(distributorAccount)) {
    const trustTx = (await buildTx(distributorAccount))
      .addOperation(StellarSdk.Operation.changeTrust({ asset: customAsset }))
      .build();
    const trustResult = await submit(trustTx, distributorKeypair);
    console.log(`Trustline created. Hash: ${trustResult.hash}`);
  } else {
    console.log("Trustline already exists on distributor account.");
  }

  const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());
  const mintTx = (await buildTx(issuerAccount))
    .addOperation(
      StellarSdk.Operation.payment({
        destination: distributorKeypair.publicKey(),
        asset: customAsset,
        amount: mintAmount,
      }),
    )
    .build();
  const mintResult = await submit(mintTx, issuerKeypair);
  console.log(`Minted ${mintAmount} ${tokenCode}. Hash: ${mintResult.hash}`);

  const refreshedIssuer = await server.loadAccount(issuerKeypair.publicKey());
  const setHomeTx = (await buildTx(refreshedIssuer))
    .addOperation(StellarSdk.Operation.setOptions({ homeDomain }))
    .build();
  const homeResult = await submit(setHomeTx, issuerKeypair);
  console.log(`Home domain set to ${homeDomain}. Hash: ${homeResult.hash}`);

  console.log("Done.");
  console.log(`Check asset metadata at: ${HORIZON_URL}/assets?asset_code=${encodeURIComponent(tokenCode)}&asset_issuer=${encodeURIComponent(issuerKeypair.publicKey())}`);
})();
