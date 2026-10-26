package scalus.playground

import scalus.compiler.Options
import scalus.compiler.sir.SIR
import scalus.uplc.PlutusV3
import scalus.uplc.eval.Result
import scalus.uplc.transform.V3Optimizer

/** Helpers for play.scalus.org. Output written through `section` lands in its own tab in the UI. */
object Playground:
    private val Marker = "@@playground:"

    /** Wraps SIR from `scalus.compiler.compileWithOptions` as a Plutus V3 script.
      *
      * `PlutusV3.compile` goes through a macro, which the browser compiler cannot expand yet.
      */
    def v3(sir: SIR, options: Options = Options.release): PlutusV3[Unit] =
        PlutusV3(
          () => (),
          sir,
          options,
          new V3Optimizer(options.cseIterations, options.cceEnabled, options.letChainRegroup)
        )

    /** Prints the script size, UPLC and double-CBOR hex into the Script tabs. */
    def show(compiled: PlutusV3[?]): Unit =
        val program = compiled.program
        section("size")(println(compiled.script.script.size))
        section("uplc")(println(program.show))
        section("cbor")(println(program.doubleCborHex))

    /** Adds one evaluation result to the Budget tab. */
    def budget(label: String, result: Result): Unit =
        val logs = result.logs.mkString(" | ")
        section("budget")(
          println(s"$label\t${result.isSuccess}\t${result.budget.memory}\t${result.budget.steps}\t$logs")
        )

    private def section(name: String)(body: => Unit): Unit =
        println(s"$Marker$name")
        body
        println(s"${Marker}end")
