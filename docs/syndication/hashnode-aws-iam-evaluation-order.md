# Syndication procedure · Hashnode, "How AWS actually evaluates IAM policies: identity vs resource"

**Direction of canonical:** reliastra.com first, Hashnode second. The Hashnode
post carries `originalArticleURL` (canonical) pointing at the paper. Never the
other way round.

**What this is:** the existing live Hashnode post, superseded **in place**. The
post's URL and its slot in the *Cloud Identity Security Engineering* series are
the asset; a new post would throw both away. The body is replaced wholesale by
[`hashnode-aws-iam-evaluation-order.post.md`](./hashnode-aws-iam-evaluation-order.post.md),
a derivative written for Hashnode's register: first person, shorter, code and
tables inline, apparatus left in the paper.

The derivative is deliberately **not** a copy of the paper. A verbatim duplicate
splits ranking signals across two URLs and ships tables and figure captions that
are native to the paper's renderer but not to Hashnode's editor. It restates the
findings, keeps three figures and two pseudocode blocks, and points at the paper
for the matrix, the bibliography and the limitations.

---

## Before publishing

1. **The paper must be live on reliastra.com first.** Confirm
   `https://reliastra.com/research/cloud-security/aws-iam-policy-evaluation-order`
   returns 200 in production (not just in this branch's preview) and that its
   `og:image` resolves.
2. **Generate the syndication rasters.** Hashnode will not host the SVGs.
   From the repository root, with `frontend` dependencies installed:

   ```bash
   node research/aws-iam-evaluation-order/figures/export-figures.mjs --png
   ```

   This writes `research/aws-iam-evaluation-order/figures/syndication/*.png`
   (git-ignored by design - rasters are copies for a platform, not artifacts of
   record). The three the post references are
   `fig-1-evaluation-pipeline.png`, `fig-3-tightening-fallacy.png` and
   `fig-4-verification-gap.png`.

## In the Hashnode editor

3. Open the **existing** post. Do not create a new one.
4. Replace the body with the contents of
   `hashnode-aws-iam-evaluation-order.post.md`.
5. Upload the three PNGs through the editor and replace the local
   `./figures/syndication/...` paths with the returned CDN URLs. Keep each
   image's alt text and the italic caption sentence beneath it: on a platform
   that strips figure markup, that sentence is what carries the finding.
6. Cover image: `frontend/public/social/research/aws-iam-policy-evaluation-order-og.png`
   - the same card the paper serves as its `og:image`, so a share of either URL
   looks identical.
7. In the post's SEO / canonical settings, set the canonical URL
   (`originalArticleURL`) to
   `https://reliastra.com/research/cloud-security/aws-iam-policy-evaluation-order`.
8. Leave the series membership and its order untouched, and keep the existing
   tags; add `aws-iam` and `policy-evaluation` only if absent.
9. Keep the post title. The URL is derived from it on some platforms' legacy
   slugs, and the series slot is indexed against it.

## After publishing

10. View source on the Hashnode URL and confirm
    `<link rel="canonical" href="https://reliastra.com/research/cloud-security/aws-iam-policy-evaluation-order">`.
11. Confirm the series navigation still lists the post in its original slot,
    and that the reliastra page is unchanged (it must not link back as
    "canonical" anywhere).
12. Social and LLM caches: the old share URL keeps its old preview until each
    platform re-crawls. Use the platform's re-scrape / debugger tool for the
    Hashnode URL and for the reliastra URL.

## Then tell me it is live

Post-publication verification (BLOCK D) runs from here: canonical direction on
both URLs, no second indexable copy of the derivative, series links intact,
the OG card and its alt resolving on both, and `llms.txt` / `llms-full.txt` /
sitemap still describing only the reliastra side. None of that is checkable
until the post is live.
