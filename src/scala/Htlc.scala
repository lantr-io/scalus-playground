import java.time.Instant
import scalus.*
import scalus.cardano.ledger.{CardanoInfo, Utxos, Value}
import scalus.cardano.onchain.plutus.v3.*
import scalus.cardano.onchain.plutus.prelude.*
import scalus.cardano.txbuilder.RedeemerPurpose.ForSpend
import scalus.cardano.txbuilder.txBuilder
import scalus.compiler.{Compile, Options}
import scalus.uplc.PlutusV3
import scalus.uplc.builtin.{ByteString, Data, FromData, ToData}
import scalus.uplc.builtin.Builtins.sha3_256
import scalus.uplc.builtin.Data.toData
import scalus.uplc.eval.PlutusVM
import scalus.playground.{Party, Playground}
import scalus.playground.Playground.scriptContextV3

// Hash time-locked contract (HTLC), as in scalus-examples/htlc:
// the receiver can claim the funds with the secret before the timeout,
// the committer can take them back after it.

case class Config(
    committer: PubKeyHash,
    receiver: PubKeyHash,
    image: ByteString, // sha3_256 of the secret
    timeout: PosixTime
) derives FromData, ToData

enum Action derives FromData, ToData:
    case Timeout
    case Reveal(preimage: ByteString)

@Compile
object HtlcValidator extends Validator {
    inline override def spend(
        datum: Option[Data],
        redeemer: Data,
        tx: TxInfo,
        ownRef: TxOutRef
    ): Unit = {
        val config = datum.getOrFail("Invalid datum").to[Config]
        redeemer.to[Action] match
            case Action.Timeout =>
                val validFrom = tx.validFromOrFail("Validity range must be bounded")
                require(config.timeout <= validFrom, "Too early to take it back")
                require(tx.isSignedBy(config.committer), "Must be signed by the committer")
            case Action.Reveal(preimage) =>
                val validTo = tx.validToOrFail("Validity range must be bounded")
                require(validTo <= config.timeout, "Too late to reveal")
                require(tx.isSignedBy(config.receiver), "Must be signed by the receiver")
                require(sha3_256(preimage) == config.image, "Invalid preimage")
    }
}

@main def play() =
    given Options = Options.release
    given CardanoInfo = CardanoInfo.mainnet
    given PlutusVM = PlutusVM.makePlutusV3VM()

    val compiled = PlutusV3.compile(HtlcValidator.validate).withErrorTraces
    Playground.show(compiled)

    // Alice locks 10 ada for Bob, behind the hash of a secret, until the timeout.
    val (alice, bob) = (Party.Alice, Party.Bob)
    val secret = ByteString.fromString("open sesame")
    val timeout = Instant.parse("2026-12-31T12:00:00Z")
    val config = Config(
      committer = PubKeyHash(alice.keyHash),
      receiver = PubKeyHash(bob.keyHash),
      image = sha3_256(secret),
      timeout = BigInt(timeout.toEpochMilli)
    )
    val locked = Playground.lockedUtxo(compiled, Value.ada(10), config.toData)

    def reveal(preimage: ByteString, at: Instant) = txBuilder
        .spend(locked, Action.Reveal(preimage), compiled)
        .requireSignature(bob.keyHash)
        .payTo(bob.address, Value.ada(10))
        .validTo(at)
        .draft
    def takeBack(at: Instant) = txBuilder
        .spend(locked, Action.Timeout, compiled)
        .requireSignature(alice.keyHash)
        .payTo(alice.address, Value.ada(10))
        .validFrom(at)
        .draft

    val hour = java.time.Duration.ofHours(1)
    val cases = Seq(
      "Bob reveals the secret in time" -> reveal(secret, timeout.minus(hour)),
      "Bob reveals a wrong secret" -> reveal(ByteString.fromString("guess"), timeout.minus(hour)),
      "Alice takes it back after the timeout" -> takeBack(timeout.plus(hour)),
      "Alice takes it back too early" -> takeBack(timeout.minus(hour))
    )
    for (label, tx) <- cases do
        val context = tx.scriptContextV3(Utxos(locked), ForSpend(locked.input))
        Playground.budget(label, compiled.program.$(context.toData).evaluateDebug)
    println("Done. See the Budget tab.")
