import scalus.*
import scalus.compiler.Options
import scalus.uplc.PlutusV3
import scalus.uplc.builtin.Data
import scalus.uplc.builtin.Data.toData
import scalus.uplc.eval.PlutusVM
import scalus.cardano.onchain.plutus.prelude.*
import scalus.playground.Playground

/** The smallest script: accept a number only if doubling it gives 42. */
@main def play() =
    given Options = Options.release
    given PlutusVM = PlutusVM.makePlutusV3VM()

    val compiled = PlutusV3.compile: (n: Data) =>
        require(n.to[BigInt] * 2 == BigInt(42), "Not the answer")
    Playground.show(compiled.withErrorTraces)

    for n <- Seq(BigInt(21), BigInt(20)) do
        val result = compiled.withErrorTraces.program.$(n.toData).evaluateDebug
        Playground.budget(s"n = $n", result)
