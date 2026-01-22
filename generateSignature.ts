import * as crypto from "crypto";

function atob(str: string) {
  return Buffer.from(str, "base64").toString("binary");
}

export function createSignature(
  method: string,
  url: string,
  body: any,
  timestamp: string,
  secretKey: string,
) {
  const bodyBuffer = Buffer.from(JSON.stringify(body));

  const secret = atob(secretKey);

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(timestamp);
  hmac.update(method);
  hmac.update(url);

  if (bodyBuffer != null) {
    hmac.update(bodyBuffer);
  }

  const hash = hmac.digest();
  const signature = hash.toString("base64url");

  return signature;
}
const SECRET_KEY =
  "e9a6c7ca2d9a864f263b941dd3a75c9136c531a88da4c45576e04aebeda69a86";
const timestamp = Date.now().toString();

const sign = createSignature(
  "GET",
  "https://idrx.co/api/auth/members",
  {},
  timestamp,
  SECRET_KEY,
);

console.log("SIGNATURE: ", sign, "TIMESTAMP : ", timestamp);
