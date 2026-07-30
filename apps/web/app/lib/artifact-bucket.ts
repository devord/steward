/**
 * Viewer-faceted regrouping for kit ledgers, injected by the board (ADR-0050).
 *
 * A published artifact is one file read by everyone the board is shared with,
 * so it can never say "yours" (ADR-0039). It says who authored a row and who
 * was asked to review it; this resolves that against the signed-in viewer at
 * render time. The raw file keeps the neutral render, which is the specified
 * floor rather than a degradation.
 *
 * **Why the board owns it rather than the routine.** `repo-pulse` used to
 * carry this as ~40 lines the model transcribed into every run. Behaviour is
 * the worst thing to re-derive per run: a drifted stylesheet looks wrong, a
 * drifted bucketing shows the wrong person's queue and looks fine. It is also
 * the seam the copy action already proved — a kit component can carry injected
 * behaviour without shipping a framework.
 *
 * **No explicit re-fit.** The tile guard's MutationObserver watches
 * `document.body` with `subtree: true`, so moving rows re-triggers the fit
 * pass on its own. That is the same mechanism that catches a sort or filter
 * click, and it is why an interactive tile cannot silently overflow.
 */
export const ARTIFACT_BUCKET_SCRIPT = `<script data-steward-bucket>(function(){
function run(){
  var v=window.__STEWARD_VIEWER__
  var me=v&&v.login
  if(!me)return
  var tables=document.querySelectorAll("table[data-kit-viewer-groups]")
  for(var t=0;t<tables.length;t++)bucket(tables[t],me)
}
function bucket(table,me){
  var cfg
  try{cfg=JSON.parse(table.getAttribute("data-kit-viewer-groups")||"")}catch(e){return}
  if(!cfg||!cfg.reviewer||!cfg.author||!cfg.rest)return
  // Only [data-fit-item] bodies are rows; the others are group headings, which
  // this rebuilds.
  var bodies=table.querySelectorAll("tbody[data-fit-item]")
  var mine=[],asked=[],rest=[],i
  for(i=0;i<bodies.length;i++){
    var b=bodies[i]
    var revs=(b.getAttribute("data-reviewers")||"").split(/\\s+/)
    var isRev=false
    for(var j=0;j<revs.length;j++)if(revs[j]&&revs[j]===me)isRev=true
    // Reviewer wins over author: "waiting on you" outranks "belongs to you",
    // and a row cannot sit in two buckets.
    if(isRev)asked.push(b)
    else if(b.getAttribute("data-author")===me)mine.push(b)
    else rest.push(b)
  }
  // Nobody's row here. Leave the neutral render exactly as published rather
  // than rebuild it into the same thing under different headings.
  if(!asked.length&&!mine.length)return
  var headings=table.querySelectorAll("tbody:not([data-fit-item])")
  var span=1
  var firstCell=headings[0]&&headings[0].querySelector("td")
  if(firstCell)span=firstCell.getAttribute("colspan")||1
  var cls=firstCell?firstCell.className:""
  for(i=0;i<headings.length;i++)headings[i].remove()
  function head(label,n){
    var tb=document.createElement("tbody")
    var tr=document.createElement("tr")
    var td=document.createElement("td")
    td.setAttribute("colspan",span)
    td.className=cls
    td.textContent=label+" · "+n
    tr.appendChild(td);tb.appendChild(tr)
    return tb
  }
  function put(label,list){
    if(!list.length)return
    table.appendChild(head(label,list.length))
    for(var k=0;k<list.length;k++)table.appendChild(list[k])
  }
  // Old and waiting on you is the emergency, so the asked bucket leads.
  put(cfg.reviewer,asked)
  put(cfg.author,mine)
  put(cfg.rest,rest)
}
// The neutral render is the floor: any failure leaves the published markup
// untouched rather than half-rebuilt.
function safe(){try{run()}catch(e){}}
document.readyState==="loading"
  ?addEventListener("DOMContentLoaded",safe)
  :safe()
})()</script>`
