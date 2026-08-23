# Apple signing and notarization

StandUp is distributed outside the Mac App Store as a DMG. Production builds
use a **Developer ID Application** certificate and Apple notarization so
Gatekeeper can verify the download. Apple credentials are used only by the
macOS GitHub Actions runner and are never bundled into StandUp.

The Windows build remains a separate NSIS installer. An Apple certificate
cannot sign Windows software; Windows code signing can be added independently
later without changing the macOS setup.

## 1. Create the Developer ID Application certificate

This must be completed by the Apple Developer Program Account Holder.

1. On a Mac, open **Keychain Access**.
2. Choose **Keychain Access > Certificate Assistant > Request a Certificate
   From a Certificate Authority**.
3. Save the certificate signing request (`.certSigningRequest`) to disk.
4. Open Apple Developer **Certificates, Identifiers & Profiles > Certificates**.
5. Add a certificate, select **Developer ID Application**, upload the request,
   and download the resulting `.cer` file.
6. Open the `.cer` file on the same Mac. Under **My Certificates** in Keychain
   Access, confirm that the certificate expands to show its private key.
7. Export that complete certificate entry as a password-protected `.p12` file.

Do not create a Developer ID Installer certificate for this DMG workflow. The
application inside the DMG is signed with Developer ID Application.

## 2. Create a team App Store Connect API key

Use a **team key**, not an individual key. Apple states that individual API keys
cannot use `notarytool`.

1. Open **App Store Connect > Users and Access > Integrations > Team Keys**.
2. Generate a key named `StandUp Notarization` with the **Developer** role.
3. Record the **Issuer ID** and **Key ID**.
4. Download the `.p8` private key immediately. Apple allows it to be downloaded
   only once.

Keep both private files (`.p12` and `.p8`) outside the repository.

## 3. Convert the two private files to one-line Base64 values

Run these commands in Terminal on the Mac, replacing the paths as needed:

```sh
openssl base64 -A -in /path/to/standup-developer-id.p12 -out certificate-base64.txt
openssl base64 -A -in /path/to/AuthKey_KEYID.p8 -out api-key-base64.txt
```

Create two new, unique strong passwords:

- one protects the exported `.p12` file;
- one is an arbitrary temporary-keychain password used only by GitHub Actions.

## 4. Add GitHub Actions repository secrets

In the GitHub repository, open **Settings > Environments > apple** and add all
six values under **Environment secrets**. The macOS packaging job is the only
job connected to this protected environment:

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE` | Full contents of `certificate-base64.txt` |
| `APPLE_CERTIFICATE_PASSWORD` | Password chosen while exporting the `.p12` |
| `KEYCHAIN_PASSWORD` | A different strong password for the temporary CI keychain |
| `APPLE_API_ISSUER` | Issuer ID from App Store Connect |
| `APPLE_API_KEY` | Key ID from App Store Connect |
| `APPLE_API_KEY_BASE64` | Full contents of `api-key-base64.txt` |

Never paste these values into a workflow, source file, issue, commit, or build
log. Revoke and replace a certificate or API key immediately if it is exposed.

## 5. Produce a signed release

Either:

- open **Actions > StandUp 3.1 CI and installers > Run workflow**, leave
  **Sign and notarize the Apple Silicon DMG** enabled, and run it from the V3
  branch; or
- push a version tag that exactly matches the application version, for example
  `v3.1.0`.

Manual and version-tag builds require all Apple secrets, then sign, notarize,
staple, and verify the Apple Silicon application before uploading the DMG
artifact. Normal branch and pull-request runs use ad-hoc signing for validation
and never receive production signing credentials.

When the action finishes, open its run, scroll to **Artifacts**, and download
`StandUp-macOS-Apple-Silicon`. The same run also provides
`StandUp-Windows-x64`. Each artifact includes a `.sha256` checksum file and is
retained for 30 days. Manual runs with signing disabled and ordinary branch or
pull-request runs use ad-hoc signing for validation only.

## 6. Optional verification on a Mac

After downloading and extracting the artifact:

```sh
spctl --assess --type open --context context:primary-signature -v StandUp_3.1.0_aarch64.dmg
xcrun stapler validate StandUp_3.1.0_aarch64.dmg
```

The application works offline after installation. Signing and notarization are
release-time operations only and do not add accounts or network access to the
running application.
