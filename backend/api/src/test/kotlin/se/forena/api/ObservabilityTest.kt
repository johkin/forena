package se.forena.api

import com.sun.net.httpserver.HttpServer
import io.micrometer.registry.otlp.OtlpMeterRegistry
import io.micrometer.tracing.Tracer
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporter
import io.opentelemetry.sdk.logs.export.LogRecordExporter
import io.opentelemetry.sdk.trace.SdkTracerProvider
import io.opentelemetry.sdk.trace.export.SpanExporter
import java.net.InetSocketAddress
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.slf4j.LoggerFactory
import org.springframework.boot.WebApplicationType
import org.springframework.boot.autoconfigure.ImportAutoConfiguration
import org.springframework.boot.builder.SpringApplicationBuilder
import org.springframework.boot.micrometer.metrics.autoconfigure.MetricsAutoConfiguration
import org.springframework.boot.micrometer.metrics.autoconfigure.export.otlp.OtlpMetricsExportAutoConfiguration
import org.springframework.boot.micrometer.tracing.opentelemetry.autoconfigure.OpenTelemetryTracingAutoConfiguration
import org.springframework.boot.micrometer.tracing.opentelemetry.autoconfigure.otlp.OtlpTracingAutoConfiguration
import org.springframework.boot.opentelemetry.autoconfigure.OpenTelemetrySdkAutoConfiguration
import org.springframework.boot.opentelemetry.autoconfigure.logging.otlp.OtlpLoggingAutoConfiguration
import org.springframework.boot.test.system.CapturedOutput
import org.springframework.boot.test.system.OutputCaptureExtension
import org.springframework.context.ConfigurableApplicationContext
import tools.jackson.databind.json.JsonMapper

@ExtendWith(OutputCaptureExtension::class)
class ObservabilityTest {
    // Use the real application config and logging lifecycle without DB/Auth fixtures.
    @ImportAutoConfiguration(
        OpenTelemetrySdkAutoConfiguration::class,
        OpenTelemetryTracingAutoConfiguration::class,
        OtlpTracingAutoConfiguration::class,
        OtlpLoggingAutoConfiguration::class,
        MetricsAutoConfiguration::class,
        OtlpMetricsExportAutoConfiguration::class,
    )
    class TelemetryApplication

    private fun start(vararg args: String): ConfigurableApplicationContext =
        SpringApplicationBuilder(TelemetryApplication::class.java)
            .web(WebApplicationType.NONE)
            .registerShutdownHook(false)
            .run("--spring.main.banner-mode=off", *args)

    private fun assertNoOtherExporters(context: ConfigurableApplicationContext) {
        assertThat(context.getBeansOfType(OtlpMeterRegistry::class.java)).isEmpty()
        assertThat(context.getBeansOfType(LogRecordExporter::class.java)).isEmpty()
    }

    @Test fun `default profile exports protobuf traces and emits ECS with trace correlation`(output: CapturedOutput) {
        val received = LinkedBlockingQueue<Pair<String?, ByteArray>>()
        val collector = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        collector.createContext("/v1/traces") { exchange ->
            received.add(exchange.requestHeaders.getFirst("Content-Type") to exchange.requestBody.readAllBytes())
            exchange.responseHeaders.add("Content-Type", "application/x-protobuf")
            exchange.sendResponseHeaders(200, -1)
            exchange.close()
        }
        collector.start()
        try {
            start("--management.opentelemetry.tracing.export.otlp.endpoint=http://127.0.0.1:${collector.address.port}/v1/traces").use { context ->
                assertThat(context.getBeansOfType(OtlpHttpSpanExporter::class.java)).hasSize(1)
                assertNoOtherExporters(context)
                val tracer = context.getBean(Tracer::class.java)
                val span = tracer.nextSpan().name("observability-probe").start()
                try {
                    tracer.withSpan(span).use {
                        LoggerFactory.getLogger("observability-test").error("ecs-probe", IllegalStateException("synthetic\nerror"))
                    }
                } finally {
                    span.end()
                }
                val result = context.getBean(SdkTracerProvider::class.java).forceFlush()
                result.join(10, TimeUnit.SECONDS)
                assertThat(result.isSuccess).isTrue()
                val request = received.poll(10, TimeUnit.SECONDS)
                assertThat(request).isNotNull()
                assertThat(request!!.first).isEqualTo("application/x-protobuf")
                assertThat(request.second.toString(Charsets.ISO_8859_1)).contains("observability-probe", "forena-api")

                val line = output.out.lineSequence().first { it.contains("ecs-probe") }
                val log = JsonMapper.builder().build().readTree(line)
                assertThat(log.get("message").asString()).isEqualTo("ecs-probe")
                assertThat(log.at("/log/level").asString()).isEqualTo("ERROR")
                assertThat(log.at("/service/name").asString()).isEqualTo("forena-api")
                assertThat(log.get("trace.id").asString()).isEqualTo(span.context().traceId())
                assertThat(log.get("span.id").asString()).isEqualTo(span.context().spanId())
                assertThat(log.at("/error/stack_trace").asString()).contains("synthetic\nerror")
            }
        } finally {
            collector.stop(0)
        }
    }

    @Test fun `local profile keeps plaintext logging without any OTLP exporter`(output: CapturedOutput) {
        start("--spring.profiles.active=local").use { context ->
            assertThat(context.getBeansOfType(SpanExporter::class.java)).isEmpty()
            assertNoOtherExporters(context)
            LoggerFactory.getLogger("observability-test").info("local-plaintext-probe")
            val line = output.out.lineSequence().first { it.contains("local-plaintext-probe") }
            assertThat(line).contains("INFO", "local-plaintext-probe").doesNotStartWith("{")
        }
    }
}
