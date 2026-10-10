import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

/** A test-owned OSRM response, with no public routing requests. */
export function createRoomRoutingStub() {
  return createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/health") {
      response.writeHead(200).end("ok");
      return;
    }
    const coordinates = url.pathname
      .split("/")
      .at(-1)
      .split(";")
      .map((point) => point.split(",").map(Number));
    if (
      coordinates.length !== 2 ||
      coordinates.some(
        (point) =>
          point.length !== 2 || point.some((value) => !Number.isFinite(value)),
      )
    ) {
      response.writeHead(400).end("Choose two route endpoints.");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        code: "Ok",
        routes: [
          {
            geometry: { type: "LineString", coordinates },
            distance: 100,
            duration: 80,
          },
        ],
      }),
    );
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = createRoomRoutingStub();
  server.listen(4320, "127.0.0.1");
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.close());
  }
}
