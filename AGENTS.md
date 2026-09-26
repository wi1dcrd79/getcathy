<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Signatures
- Signature rows and images are written only by `submitSignature` (service role) after role/tenant/RFC 8785 hash checks — client INSERT on `signatures` and all client writes to the `signatures` bucket are intentionally absent, so signed evidence can't be forged or overwritten.
- Signed-field lists live in `src/lib/signatures/signed-fields.ts`, shared by client and server — change them in one place or client/server hashes diverge.
