import { loader } from "fumadocs-core/source"
import { docs } from "collections/server"

/** The docs content source — MDX under content/docs, served at /docs. */
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
})
