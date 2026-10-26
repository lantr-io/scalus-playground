import scalus.*
import scalus.compiler.{Options, compileWithOptions}
import scalus.uplc.eval.PlutusVM
import scalus.playground.Playground

/** The smallest example: compile a Scala expression to UPLC and evaluate it. */
@main def play() =
    val sir = compileWithOptions(Options.release, BigInt(2) * BigInt(21))
    val compiled = Playground.v3(sir)
    Playground.show(compiled)

    given PlutusVM = PlutusVM.makePlutusV3VM()
    val result = compiled.program.evaluateDebug
    Playground.budget("2 * 21", result)
    println(s"Result: $result")
