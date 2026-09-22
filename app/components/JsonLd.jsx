import { jsonLdString } from '../../lib/jsonld.js';

// The payload goes in as a plain text child, not dangerouslySetInnerHTML.
// jsonLdString has already escaped every character React's text escaping
// would otherwise touch, so there's nothing left for it to do, and no way
// for the payload to break out of the <script> tag.
export default function JsonLd({ data }) {
  return <script type="application/ld+json">{jsonLdString(data)}</script>;
}
