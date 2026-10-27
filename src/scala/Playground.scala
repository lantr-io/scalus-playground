package scalus.playground

import scalus.cardano.address.{Network, ShelleyAddress}
import scalus.cardano.address.ShelleyDelegationPart.Null
import scalus.cardano.address.ShelleyPaymentPart.Key
import scalus.cardano.ledger.*
import scalus.cardano.onchain.plutus.v3 as onchainV3
import scalus.cardano.txbuilder.{RedeemerManagement, RedeemerPurpose}
import scalus.compiler.Options
import scalus.compiler.sir.SIR
import scalus.uplc.{CompiledPlutus, PlutusV3}
import scalus.uplc.builtin.{Builtins, ByteString, Data}
import scalus.uplc.eval.Result
import scalus.uplc.transform.V3Optimizer

/** A named party with a deterministic key hash, for building draft transactions.
  *
  * It has no private key: `TxBuilder.draft` does not sign, so a key hash is all a validator sees.
  */
final case class Party(name: String):
    val keyHash: AddrKeyHash = AddrKeyHash(Builtins.blake2b_224(ByteString.fromString(name)))
    def address(using env: CardanoInfo): ShelleyAddress = ShelleyAddress(env.network, Key(keyHash), Null)

object Party:
    val Alice = Party("Alice")
    val Bob = Party("Bob")
    val Charles = Party("Charles")

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

    /** A UTxO locked at the script's address, as if an earlier transaction had created it. */
    def lockedUtxo(compiled: CompiledPlutus[?], value: Value, datum: Data, index: Int = 0)(using
        env: CardanoInfo
    ): Utxo =
        Utxo(
          TransactionInput(TransactionHash.fromHex("00" * 32), index),
          TransactionOutput(compiled.address(env.network), value, datum)
        )

    extension (tx: Transaction)
        /** The V3 script context the validator sees for `purpose` in this transaction. */
        def scriptContextV3(utxos: Utxos, purpose: RedeemerPurpose)(using
            env: CardanoInfo
        ): onchainV3.ScriptContext =
            val index = RedeemerManagement.indexFor(tx, purpose)
            PlutusScriptEvaluator
                .buildScriptContexts(tx, utxos, env.slotConfig, env.majorProtocolVersion)
                .collectFirst {
                    case (r, sc: onchainV3.ScriptContext) if r.tag == purpose.redeemerTag && r.index == index => sc
                }
                .getOrElse(throw new NoSuchElementException(s"No V3 script context for $purpose"))

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
