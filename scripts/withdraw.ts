import {
  AccountWallet,
  AztecAddress,
  Contract,
  Fr,
  getWallet,
  SponsoredFeePaymentMethod,
  Wallet,
} from '@aztec/aztec.js';
import { CrowdfundingContract } from './Crowdfunding.ts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { readData, getPXEs } from './utils.ts';
import { getSponsoredFPCInstance } from './fpc.ts';
import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { computePartialAddress } from '@aztec/stdlib/contract';
import { getSingleKeyAccountContractArtifact } from '@aztec/accounts/single_key/lazy';
import { SingleKeyAccountContract } from '@aztec/accounts/single_key';

const CrowdfundingContractArtifact = CrowdfundingContract.artifact;

async function main(): Promise<void> {

  // pxe2 is operator
  const [pxe1, pxe2, pxe3] = await getPXEs(['pxe1', 'pxe2', 'pxe3']);
  const sponseredFPC = await getSponsoredFPCInstance();
  const paymentMethod = new SponsoredFeePaymentMethod(sponseredFPC.address);

  const data = readData();
  let operatorSecertKey = Fr.fromString(data.operatorSecertKey);
  let operatorSalt = Fr.fromString(data.operatorSalt);
  const schnorWallet = await getSchnorrAccount(
    pxe2,
    operatorSecertKey,
    deriveSigningKey(operatorSecertKey),
    operatorSalt,
  );


// operator wallet
  const senderWallet = await schnorWallet.getWallet();

  const sender: string = senderWallet.getAddress().toString();
  console.log(`Using wallet: ${sender}`);

  const token = data.tokenAddress;
  const amount = 10n;

  const TokenContractArtifact = TokenContract.artifact;
  const asset = await Contract.at(
    AztecAddress.fromString(token),
    TokenContractArtifact,
    senderWallet as Wallet,
  );

  console.log(
    `private balance of sender ${senderWallet.getAddress()}: `,
    await asset.methods
      .balance_of_private(senderWallet.getAddress())
      .simulate(),
  );

  console.log(
    `private balance of contribution contract ${AztecAddress.fromString(data.crowdFundingContractAddress)}: `,
    await asset.withWallet(senderWallet).methods
      .balance_of_private(AztecAddress.fromString(data.crowdFundingContractAddress))
      .simulate(),
  );
  const contract = await Contract.at(
    AztecAddress.fromString(data.crowdFundingContractAddress),
    CrowdfundingContractArtifact,
    senderWallet,
  );

  const commitTx = await contract.methods
    .withdraw(amount)
    .send({ fee: { paymentMethod } })
    .wait();

  const txEffect = await pxe2.getTxEffect(commitTx.txHash);
  console.log('TxEffect: ', txEffect.data.privateLogs);

  console.log('tx : ', commitTx);
  console.log(
    `private balance of sender ${senderWallet.getAddress()}: `,
    await asset.methods
      .balance_of_private(senderWallet.getAddress())
      .simulate(),
  );
}

main().catch((err: any) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
