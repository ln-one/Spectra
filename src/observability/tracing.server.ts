import "server-only";

import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { core, NodeSDK, tracing } from "@opentelemetry/sdk-node";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
} from "@opentelemetry/semantic-conventions";
import type { ServerEnvironment } from "@/environment/server";

const tracerName = "spectra.application";

let tracingSdk: NodeSDK | null = null;
let tracingStopped = false;

function traceEndpoint(baseUrl: string) {
  const endpoint = new URL(baseUrl);
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/v1/traces`;
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint.toString();
}

function samplerFor(environment: ServerEnvironment) {
  const ratio = environment.OTEL_TRACES_SAMPLER_ARG;
  switch (environment.OTEL_TRACES_SAMPLER) {
    case "always_off":
      return new tracing.AlwaysOffSampler();
    case "always_on":
      return new tracing.AlwaysOnSampler();
    case "parentbased_always_off":
      return new tracing.ParentBasedSampler({ root: new tracing.AlwaysOffSampler() });
    case "parentbased_always_on":
      return new tracing.ParentBasedSampler({ root: new tracing.AlwaysOnSampler() });
    case "parentbased_traceidratio":
      return new tracing.ParentBasedSampler({
        root: new tracing.TraceIdRatioBasedSampler(ratio),
      });
    case "traceidratio":
      return new tracing.TraceIdRatioBasedSampler(ratio);
  }
}

export function startApplicationTracing(serviceName: string, environment: ServerEnvironment): void {
  if (!environment.OTEL_EXPORTER_OTLP_ENDPOINT || tracingSdk || tracingStopped) return;
  const exporter = new OTLPTraceExporter({
    headers: core.parseKeyPairsIntoRecord(environment.OTEL_EXPORTER_OTLP_HEADERS),
    url: traceEndpoint(environment.OTEL_EXPORTER_OTLP_ENDPOINT),
  });
  const sdk = new NodeSDK({
    instrumentations: [
      new PinoInstrumentation({
        disableLogSending: true,
        logKeys: {
          spanId: "span_id",
          traceFlags: "trace_flags",
          traceId: "trace_id",
        },
      }),
    ],
    resource: resourceFromAttributes({
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: environment.NODE_ENV,
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    sampler: samplerFor(environment),
    traceExporter: exporter,
  });
  sdk.start();
  tracingSdk = sdk;
}

export async function shutdownApplicationTracing(): Promise<void> {
  const sdk = tracingSdk;
  if (!sdk) return;
  tracingSdk = null;
  tracingStopped = true;
  await sdk.shutdown();
}

export const applicationTracer = trace.getTracer(tracerName);
