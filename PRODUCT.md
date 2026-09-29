# Aperture
<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Delegated implementation: React and Vite, a Node 22 HTTP service and SQLite persistence. A single process owns atomic writes. No AWS dependency in this release.

## Users and purpose
The camera owner wants to disclose one approved fact about an object in a bounded area for a limited time. A pickup recipient can request that fact without viewing camera footage. The approved concept is documented in ../aperture-concept-brief.md. Customer demand remains unvalidated.

## Workflow
The owner registers a private account, uploads an authorized reference image, marks an area, names the object and approves the disclosure. They issue a short-lived bearer pass with a finite check budget and cooldown. The recipient requests a check. The owner records a timestamped observation; server policy determines whether it can be released. Owner-only receipts preserve the sequence.

## Constraints
The default provider is manual owner observation. An optional per-owner Playground-token adapter calls the official Ring device and snapshot APIs; an owner interprets and approves each image. Automated vision is not connected. Recipients receive only the approved question, finite result, source timestamp and access status. They never receive images, internal notes, account details or arbitrary query input. In-flight revocation or expiry must block release. Uploaded frames are private, consented, resized and metadata-stripped. Empty accounts contain no fabricated observations.

## Principles
Permission before interpretation. Preserve uncertainty and source time. A bearer link is transferable. An absence answer concerns only the approved area at the observation time.

## Evidence
Approved brief and published Ring documentation references. The Ring adapter is verified against explicit synthetic contract fixtures. No actual Ring device, official simulator frame, production deployment, user interviews or recognition accuracy has been verified.
