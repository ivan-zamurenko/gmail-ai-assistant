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
