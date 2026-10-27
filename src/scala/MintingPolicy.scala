import scalus.*
import scalus.cardano.ledger.{AssetName, CardanoInfo, Coin, Value}
import scalus.cardano.onchain.plutus.v3.*
import scalus.cardano.onchain.plutus.prelude.*
import scalus.cardano.txbuilder.RedeemerPurpose.ForMint
import scalus.cardano.txbuilder.txBuilder
import scalus.compiler.{Compile, Options}
import scalus.uplc.PlutusV3
import scalus.uplc.builtin.Data
import scalus.uplc.builtin.Data.toData
import scalus.uplc.eval.PlutusVM
import scalus.playground.{Party, Playground}
import scalus.playground.Playground.scriptContextV3

/** Minting policy: tokens can be minted or burned only in transactions the admin signs.
  *
  * The admin is a parameter, applied to the compiled script, so each admin gets its own policy ID.
  */
@Compile
object AdminMintingPolicy extends DataParameterizedValidator {
    inline override def mint(admin: Data, redeemer: Data, policyId: PolicyId, tx: TxInfo): Unit =
        require(tx.isSignedBy(admin.to[PubKeyHash]), "Must be signed by the admin")
}

@main def play() =
    given Options = Options.release
    given CardanoInfo = CardanoInfo.mainnet
    given PlutusVM = PlutusVM.makePlutusV3VM()

    val admin = Party.Alice
    val policy = PlutusV3
        .compile(AdminMintingPolicy.validate)
        .apply(PubKeyHash(admin.keyHash).toData)
        .withErrorTraces
    Playground.show(policy)

    val policyId = policy.script.scriptHash
    val token = AssetName.fromString("PlayToken")
    println(s"Policy ID: ${policyId.toHex}")

    // Draft a transaction that mints 1000 PlayTokens, signed by the admin or by someone else.
    for signer <- Seq(Party.Alice, Party.Bob) do
        val tx = txBuilder
            .mint(policy, Map(token -> 1000L), Data.unit)
            .requireSignature(signer.keyHash)
            .payTo(signer.address, Value.asset(policyId, token, 1000L, Coin.ada(2)))
            .draft
        val context = tx.scriptContextV3(Map.empty, ForMint(policyId))
        Playground.budget(s"${signer.name} mints", policy.program.$(context.toData).evaluateDebug)
    println("Done. See the Budget tab.")
