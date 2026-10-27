import scalus.*
import scalus.cardano.ledger.{CardanoInfo, Utxos, Value}
import scalus.cardano.onchain.plutus.v3.*
import scalus.cardano.onchain.plutus.prelude.*
import scalus.cardano.txbuilder.RedeemerPurpose.ForSpend
import scalus.cardano.txbuilder.txBuilder
import scalus.compiler.{Compile, Options}
import scalus.uplc.builtin.Data
import scalus.uplc.builtin.Data.toData
import scalus.uplc.PlutusV3
import scalus.uplc.eval.PlutusVM
import scalus.playground.{Party, Playground}
import scalus.playground.Playground.scriptContextV3

/** Spending validator: the owner (datum) must sign, and the redeemer must be "Hello, World!". */
@Compile
object HelloCardano extends Validator {
    inline override def spend(
        datum: Option[Data],
        redeemer: Data,
        tx: TxInfo,
        ownRef: TxOutRef
    ): Unit = {
        val owner = datum.getOrFail("Datum not found").to[PubKeyHash]
        val signed = tx.signatories.contains(owner)
        require(signed, "Must be signed")
        val saysHello = redeemer.to[String] == "Hello, World!"
        require(saysHello, "Invalid redeemer")
    }
}

@main def play() =
    given Options = Options.release
    given CardanoInfo = CardanoInfo.mainnet
    given PlutusVM = PlutusVM.makePlutusV3VM()

    // Error traces make failures explain themselves ("Invalid redeemer"), at a cost in size.
    val compiled = PlutusV3.compile(HelloCardano.validate).withErrorTraces
    Playground.show(compiled)

    // Alice locked 10 ada at the script, with her key hash as the datum.
    val alice = Party.Alice
    val locked = Playground.lockedUtxo(compiled, Value.ada(10), PubKeyHash(alice.keyHash).toData)

    // Draft the transaction that spends it, and evaluate the validator against it.
    for redeemer <- Seq("Hello, World!", "Bye") do
        val tx = txBuilder
            .spend(locked, redeemer, compiled)
            .requireSignature(alice.keyHash)
            .payTo(alice.address, Value.ada(10))
            .draft
        val context = tx.scriptContextV3(Utxos(locked), ForSpend(locked.input))
        val result = compiled.program.$(context.toData).evaluateDebug
        Playground.budget(s"redeemer = \"$redeemer\"", result)
    println("Done. See the UPLC, CBOR and Budget tabs.")
