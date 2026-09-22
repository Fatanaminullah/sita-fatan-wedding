import { Fragment } from 'react'
import { parseWhatsAppText, type RichNode } from '@/domain/wa-format'

/**
 * A WhatsApp message body, drawn the way WhatsApp draws it.
 *
 * The inbox stores what was sent, marks and all. Printing that raw turned the
 * invitation into a paragraph with asterisks and underscores through it, which
 * reads as a rendering fault rather than as the message the guest received.
 *
 * The parsing is in the domain, where it is tested. This only chooses tags.
 */
function render(nodes: RichNode[]) {
  return nodes.map((node, index) => {
    if (node.type === 'text') return <Fragment key={index}>{node.value}</Fragment>
    if (node.type === 'bold') return <strong key={index}>{render(node.children)}</strong>
    if (node.type === 'italic') return <em key={index}>{render(node.children)}</em>
    if (node.type === 'strike') return <s key={index}>{render(node.children)}</s>
    return (
      <code key={index} className="rounded-[0.2rem] bg-foreground/10 px-1 font-mono text-[0.95em]">
        {render(node.children)}
      </code>
    )
  })
}

export function WaRichText({ body }: { body: string }) {
  // `whitespace-pre-wrap` on the caller keeps the newlines; this only marks up
  // what is between them.
  return <>{render(parseWhatsAppText(body))}</>
}
