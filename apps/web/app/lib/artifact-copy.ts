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
 *    `.catch()` loses the gesture and fails silently.
 * 2. **The button ships hidden.** A raw-opened artifact has no behaviour
 *    attached, and a dead control is worse than none — the same
 *    degrade-to-honest rule the rest of the contract follows. Revealing it
 *    here is what marks it live.
 */
export const ARTIFACT_COPY_SCRIPT = `<script data-steward-copy>(function(){
function write(text){
  // Synchronous path first — it is the one the sandbox reliably allows.
  var ta=document.createElement("textarea")
  ta.value=text
  ta.setAttribute("readonly","")
  ta.style.cssText="position:fixed;top:-9999px;opacity:0"
  document.body.appendChild(ta)
  ta.select()
  var ok=false
  try{ok=document.execCommand("copy")}catch(e){}
  ta.remove()
  if(ok)return true
  // Only then the async API, whose rejection we cannot surface anyway.
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text)
      return true
    }
  }catch(e){}
  return false
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
  var ok=write(payload)
  b.textContent=ok?"copied":"copy failed"
  // Restoring the label is what makes a second copy legible as a second
  // action rather than leaving the row stuck reading "copied".
  setTimeout(function(){b.textContent=label},1500)
})
document.readyState==="loading"
  ?addEventListener("DOMContentLoaded",reveal)
  :reveal()
})()</script>`
