/**
 * Behaviour for the kit's foldable queue groups, injected by the board
 * (ADR-0050, ADR-0061).
 *
 * A queue's groups are sibling `<tbody>` elements inside **one** `<table>` —
 * that shared column geometry is the whole reason `groups` exists — and a
 * table cannot hold a `<details>`: the parser fosters it out of the table
 * before any CSS runs. There is no CSS-only path either, because folding "the
 * rows of this group and no others" needs an until-the-next-heading combinator
 * CSS does not have. So the disclosure is behaviour, and it lives here for the
 * same reason the copy action does.
 *
 * Two things this does differently from the copy action, both forced by the
 * element carrying the heading's own text:
 *
 * 1. **It upgrades a node instead of revealing one.** The copy action ships a
 *    `hidden` `<button>` because a raw-opened file loses nothing by not having
 *    it. A group heading is the label, so hiding it would hide content and
 *    rendering a second copy would put the label in the document twice. The
 *    kit emits a plain `<span data-kit-disclose>` with no affordance, and this
 *    adds `role`, `tabindex` and `aria-expanded` to it. Before injection the
 *    heading is honest text; after, it is a real disclosure with a real
 *    accessible name. At no point is content behind a dead control.
 * 2. **It folds with `data-kit-collapsed`, never `hidden`.** The fit pass owns
 *    `hidden` on `[data-fit-item]` and its `reset()` clears it on every
 *    re-measure — sharing the attribute would let a re-fit silently blow a
 *    folded group open, or let a fold survive as a trim. Two owners, two
 *    attributes, no shared state.
 *
 * `collapsed` on a group picks the initial state and is applied here rather
 * than in the markup, which is the same bargain: the static file always renders
 * open (ADR-0039's honest floor), and folding is something only a reader who
 * can unfold it ever sees.
 */
export const ARTIFACT_DISCLOSE_SCRIPT = `<script data-steward-disclose>(function(){
function rowsOf(head){
  var id=head.getAttribute("data-kit-disclose")
  var t=head.closest("table")
  if(!t)return []
  return [].slice.call(t.querySelectorAll('[data-kit-group-of="'+
    (window.CSS&&CSS.escape?CSS.escape(id):id)+'"]'))
}
function apply(head,open){
  head.setAttribute("aria-expanded",open?"true":"false")
  var rows=rowsOf(head)
  for(var i=0;i<rows.length;i++){
    if(open)rows[i].removeAttribute("data-kit-collapsed")
    else rows[i].setAttribute("data-kit-collapsed","")
  }
  // The tile guard re-fits on mutation, and folding changes the artifact's
  // height — so a fold on a tile has to re-measure or the "+N more" count is
  // left describing rows that are no longer the ones hidden.
  try{window.dispatchEvent(new Event("kit:disclose"))}catch(e){}
}
function upgrade(){
  var hs=document.querySelectorAll("[data-kit-disclose]")
  for(var i=0;i<hs.length;i++){
    var h=hs[i]
    if(h.getAttribute("role")==="button")continue
    h.setAttribute("role","button")
    h.setAttribute("tabindex","0")
    // Only now does the caret mean anything, so only now is it drawn.
    h.setAttribute("data-kit-disclose-live","")
    apply(h,!h.hasAttribute("data-kit-disclose-init"))
  }
}
function toggle(h){apply(h,h.getAttribute("aria-expanded")!=="true")}
document.addEventListener("click",function(e){
  var t=e.target
  var h=t&&t.closest&&t.closest("[data-kit-disclose][role='button']")
  if(!h)return
  e.preventDefault()
  toggle(h)
})
// A span with role=button is not a button: the browser gives it no keyboard
// activation, so both keys have to be handled here or the control is
// mouse-only. Space is preventDefault'd because on a scrollable full view it
// would otherwise page down as well as fold.
document.addEventListener("keydown",function(e){
  if(e.key!==" "&&e.key!=="Enter"&&e.key!=="Spacebar")return
  var t=e.target
  var h=t&&t.closest&&t.closest("[data-kit-disclose][role='button']")
  if(!h)return
  e.preventDefault()
  toggle(h)
})
document.readyState==="loading"
  ?addEventListener("DOMContentLoaded",upgrade)
  :upgrade()
})()</script>`
