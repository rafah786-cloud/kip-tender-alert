# Tender Finder Pro

Build an app which is supposed to use only on this device, the main function of the app should be looking for tenders for supply of Mattresses , pillows and other related item(or any keywords related) which are published on the government websites like -
1. https://etenders.gov.in/eprocure/app 

2. https://eprocure.gov.in/eprocure/app

 3. https://etenders.kerala.gov.in/nicgep/app

Or any other websites if any , central government or Kerala state government only, the app should check regularly for any tenders for Mattress/Bed supply and give me a notification if it finds any.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://tenders.zizzmattress.com

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a3b53314-b358-42e3-b88f-fd9ac65af656).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Monitoring scope

The scanner checks the Central Public Procurement Portal, eTenders India, Kerala eTenders, GeM bid listings, and configured state/UT procurement portals. Some portals can change routes or block automated access; use the in-app Portal Monitoring panel to see the latest scan status and errors for each source. A successful portal fetch is not proof that every tender on that site was indexed.

The background schedule is intended to run every two hours. Configure the notification email in Settings to receive newly discovered matches. Browser notifications require browser permission and an active app session; email alerts are the option for background notifications.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Stop Scan

Tender Watch supports an administrator-only **Stop Scan** action while a scan is running. A stop request updates the scan status and the worker checks for cancellation between sources, before document analysis, and before saving results. In-flight Firecrawl requests are aborted where supported; a request that has already reached an external service may take a short time to terminate.

## Sync and deployment

Pushing a commit to the active synced branch (currently `main`) updates the Lovable project code and editor preview when Git sync receives the push. A GitHub push does **not** publish the public website. After verifying the editor preview, publish the project in Lovable to update `https://tenders.zizzmattress.com`.


<!-- lovable-sync-notice: 2026-10-31 scanner cooldown fix -->
The active scanner now isolates Firecrawl 429 handling per source and limits scan concurrency to two. The existing Lovable project must sync this branch before the change is published.


<!-- Lovable sync checkpoint: Firecrawl retry/backoff and truthful provider diagnostics -->

<!-- Retry-After compliance checkpoint: cf4cf0a6ee560064ccc550fc2a3389b04f9c4636 -->

<!-- lovable-sync checkpoint: tender discovery recall improvements, bounded parallel BOQ audits, request timeouts and CSV export are on main; latest source commit e60fd9d083a44b14017f39ddd1ae52339ce5d692 -->
