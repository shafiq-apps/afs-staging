import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { type EntryContext } from "react-router";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext
) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  // Strip /v2 base path from URL for route matching
  // React Router routes are defined for /, not /v2/
  const url = new URL(request.url);
  let pathname = url.pathname;
  if (pathname.startsWith('/v2/')) {
    pathname = pathname.slice(3); // Remove '/v2'
    if (!pathname.startsWith('/')) {
      pathname = '/' + pathname;
    }
  }
  const modifiedUrl = new URL(pathname + url.search + url.hash, url.origin);

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter
        context={reactRouterContext}
        url={modifiedUrl.toString()}
      />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
        },
      }
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
