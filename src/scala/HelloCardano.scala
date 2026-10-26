import scalus.*
import scalus.compiler.{Compile, Options, compileWithOptions}
import scalus.uplc.builtin.{ByteString, Data}
import scalus.uplc.builtin.Data.toData
import scalus.uplc.eval.PlutusVM
import scalus.cardano.onchain.plutus.v3.*
import scalus.cardano.onchain.plutus.v1.{Address, Credential, Value}
import scalus.cardano.onchain.plutus.prelude.*
import scalus.playground.Playground

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
    // Error traces make failures explain themselves ("Invalid redeemer"), at a cost in size.
    val compiled = Playground.v3(compileWithOptions(Options.release, HelloCardano.validate)).withErrorTraces
    Playground.show(compiled)

    // Evaluate the script against a spending transaction signed by the owner.
    given PlutusVM = PlutusVM.makePlutusV3VM()
    val owner = PubKeyHash(ByteString.fromHex("1234567890abcdef1234567890abcdef1234567890abcdef12345678"))
    val ownInput = TxInInfo(
      outRef = TxOutRef(TxId(ByteString.fromHex("ab" * 32)), 0),
      resolved = TxOut(
        address = Address(Credential.ScriptCredential(ByteString.fromHex("cd" * 28)), Option.None),
        value = Value.zero
      )
    )
    def context(redeemer: String) = ScriptContext(
      txInfo = TxInfo(
        inputs = List(ownInput),
        fee = 188021,
        signatories = List(owner),
        id = TxId(ByteString.fromHex("ef" * 32))
      ),
      redeemer = redeemer.toData,
      scriptInfo = ScriptInfo.SpendingScript(ownInput.outRef, Option.Some(owner.toData))
    )
    for redeemer <- Seq("Hello, World!", "Bye") do
        val result = (compiled.program $ context(redeemer).toData).evaluateDebug
        Playground.budget(s"redeemer = \"$redeemer\"", result)
    println("Done. See the UPLC, CBOR and Budget tabs.")
