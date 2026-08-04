/**
 * Behaviour for the kit's copy action, injected by the board (ADR-0050).
 *
 * Two things make this worth owning centrally rather than restating per
 * routine, both consequences of the sandbox rather than of any one widget:
 *
 * 1. **`navigator.clipboard` is unreliable here.** The frame has no
 *    `allow-same-origin`, so its origin is opaque; the async Clipboard API
 *    rejects (or is missing outright) in that context often enough that it
 *    cannot be the only path. The fallback — a hidden `<textarea>` plus
 *    `document.execCommand("copy")` — must run *inside the same synchronous
 *    click handler*, because what the sandbox actually permits is a copy
 *    during a user gesture. Awaiting the promise first and falling back in
 *    `.catch()` loses the gesture and fails silently. It also needs the
 *    frame's document to be the focused one, which an embedded artifact
 *    cannot assume — hence the `window.focus()` in `write`.
 * 2. **The button ships hidden.** A raw-opened artifact has no behaviour
 *    attached, and a dead control is worse than none — the same
 *    degrade-to-honest rule the rest of the contract follows. Revealing it
 *    here is what marks it live.
 */
export const ARTIFACT_COPY_SCRIPT = `<script data-steward-copy>(function(){
// Report only what actually happened. An earlier cut fired the async API and
// returned true without awaiting it, so a rejected write still said "copied"
// — and left an unhandled rejection behind in a frame where nobody sees the
// console. \`done\` is the single place the answer is committed.
function write(text,done){
  // execCommand("copy") is defined to fail when the document is not the
  // focused one, and an artifact is never the focused document by default —
  // it is a frame inside someone else's page, and the lightbox above it runs
  // a focus trap that has opinions about where focus belongs. Claiming the
  // frame's own window first is free when focus is already here and is the
  // difference between a copy and a "copy failed" when it is not. Inside the
  // gesture, like everything else in this function.
  try{window.focus()}catch(e){}
  // Synchronous path first — it is the one the sandbox reliably allows,
  // and it is the only one that answers within the user gesture.
  var ta=document.createElement("textarea")
  ta.value=text
  ta.setAttribute("readonly","")
  ta.style.cssText="position:fixed;top:-9999px;opacity:0"
  document.body.appendChild(ta)
  // select() moves focus to the scratch field; hand it back, or the reader
  // loses their place and the next keystroke goes nowhere.
  var had=document.activeElement
  ta.select()
  var ok=false
  try{ok=document.execCommand("copy")}catch(e){}
  ta.remove()
  try{if(had&&had.focus)had.focus()}catch(e){}
  if(ok)return done(true)
  // Fall back to the async API and wait for its verdict rather than assume one.
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(
        function(){done(true)},
        function(){done(false)}
      )
      return
    }
  }catch(e){}
  done(false)
}
function reveal(){
  var bs=document.querySelectorAll("[data-kit-copy]")
  for(var i=0;i<bs.length;i++)bs[i].hidden=false
}
document.addEventListener("click",function(e){
  var t=e.target
  var b=t&&t.closest&&t.closest("[data-kit-copy]")
  if(!b)return
  e.preventDefault()
  var payload=b.getAttribute("data-kit-copy-payload")||""
  var label=b.getAttribute("data-kit-copy-label")||"copy"
  write(payload,function(ok){
    b.textContent=ok?"copied":"copy failed"
    // Restoring the label is what makes a second copy legible as a second
    // action rather than leaving the row stuck reading "copied". Cancel any
    // pending restore first: two copies inside the window would otherwise let
    // the first timer fire during the second and reset the label early, so the
    // button reads "copy" while the copy it is reporting on just happened.
    if(b.__t)clearTimeout(b.__t)
    b.__t=setTimeout(function(){b.textContent=label;b.__t=0},1500)
  })
})
document.readyState==="loading"
  ?addEventListener("DOMContentLoaded",reveal)
  :reveal()
})()</script>`
