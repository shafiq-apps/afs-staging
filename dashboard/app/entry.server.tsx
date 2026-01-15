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
  const url = new URL(request.url);
  
  // Skip check for frontendbuild paths
  if (!url.pathname.startsWith('/frontendbuild')) {
    // TODO: Implement your shop detection logic here
    // const shopName = await getShopName(request);
    // const isOldInstallation = await checkIfOldInstallation(shopName);
    
    // Example placeholder - replace with your actual check:
    if (true) {
      const redirectUrl = new URL('/frontendbuild/index.html', url).href;
      
      // Break out of Shopify iframe and redirect to old build
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <script>
              if (window.top !== window.self) {
                window.top.location.href = "${redirectUrl}";
              } else {
                window.location.href = "${redirectUrl}";
              }
            </script>
          </head>
          <body>
            <p>Redirecting...</p>
          </body>
        </html>
      `;
      
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }
  }
  
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter
        context={reactRouterContext}
        url={request.url}
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
