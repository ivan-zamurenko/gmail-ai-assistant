# Security setup

## One-computer queue binding

The extension still signs in to Firebase automatically; there is no user-facing
login. Firebase assigns this Chrome profile a stable anonymous UID, and the bot
addresses tasks only to that UID.

1. Build and reload the extension.
2. Open the extension's offscreen-document console.
3. Copy the value printed after `Firebase executor UID:`. It is an identifier,
   not an auth token, but do not publish it unnecessarily.
4. Add it as `firebase.executorUid` in the gitignored `bot/config/local.js`.
5. Deploy `firestore.rules` to the same Firebase project before restarting the
   bot. For example, with an authenticated Firebase CLI:

   ```sh
   firebase deploy --only firestore:rules
   ```

The bot intentionally refuses to start without `executorUid`. This is fail-closed:
an unbound bot must not create depot tasks that every anonymous client can read.

## Discord access

`/find` and `/reschedule` require the Discord Administrator permission and are
also checked against the configured guild at runtime. Re-run `npm run register`
inside `bot/` after changing command permissions.

`/find` intentionally returns the full operational parcel card, including
recipient contact details and address. Its reply must remain ephemeral and
administrator-only. Do not copy these cards into public channels, logs, issues,
screenshots, or source control.

## Local secret files

Restrict the local files after creating them:

```sh
chmod 600 src/config/local.js bot/config/local.js bot/config/serviceAccount.json
```

Never record their values in the security worklog, console output, screenshots,
issues, or commits.

## OAuth scope note

The current Gmail UI only lists labels/messages, so the extension requests
`gmail.readonly`. Restore `gmail.modify` only when message label mutation is
actually enabled and reviewed. The existing Drive workflow still needs the broad
`drive` scope because it discovers and moves pre-existing files. Migrate it to
`drive.file` only together with Google Picker; changing the scope alone would
break access to the current shared folder.

## Local reschedule recovery

The `storage` permission is used for a device-local recovery queue containing
only exact consignment numbers and internal ConsIds from live Drive-label runs.
It contains no recipient name, address, phone, email, depot session URL, OAuth
token, or service credential. Confirmed changes and intentional skips are
removed; failed or indeterminate entries remain available only on the processing
day that created the batch. A later-day read deletes the stale queue so yesterday's
errors cannot be moved to a newly calculated "tomorrow". Targets are not synced
or sent to Discord/Firestore; `/reschedule retry` sends only the retry instruction
through the existing assigned, expiring task contract. Because Chrome offscreen
documents expose no storage API, the scanner reaches this single local record
through a narrow internal runtime bridge handled by the background worker.

## Remote Drive-label scan

`/reschedule barcodes` sends only the command mode and dry-run flag through
Firestore. The offscreen extension document reads the gitignored local Drive
folder setting, receives the cached Google OAuth token through an internal
runtime-only background bridge, downloads and decodes the photos locally, and
asks the worker only for exact depot lookup/reschedule operations. Photos, OAuth
tokens, Drive identifiers, and filenames are never written to Firestore or
Discord. The bounded result may contain up to
25 consignment numbers and is delivered to the administrator's private DM; the
temporary task document is deleted by the bot after completion.

Large barcode tasks may run for up to two hours. Deploy the matching
`firestore.rules` update before using the command so the claimed executor may
write its bounded `execMs` result after a long scan.
