import crypto from "node:crypto";

/** Postgres will generate these server side later. Same shape, same length. */
export const newId = () => crypto.randomUUID();

export const nowMs = () => Date.now();
