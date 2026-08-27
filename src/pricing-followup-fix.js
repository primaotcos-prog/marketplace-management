// Small responsive fix for the Auto-follow-up toggle in the Pricing configure panel.
// The original shared .pm-switch class is intentionally kept unchanged because it
// is also used by the main Auto Pricing switch.
const STYLE_ID='pricing-followup-toggle-fix-v1';
function install(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement('style');
  s.id=STYLE_ID;
  s.textContent=`
    /* Auto-follow-up has a text label, so it must not use the fixed 50px switch width. */
    .pm-switch:has(#pm-follow){
      position:relative;
      width:auto;
      min-width:190px;
      height:28px;
      flex:0 0 auto;
      display:flex;
      align-items:center;
      gap:0;
      padding-left:59px;
      box-sizing:border-box;
      margin:0 0 12px !important;
      color:#d7dee8;
      font-size:11px;
      line-height:1.2;
      white-space:nowrap;
    }
    .pm-switch:has(#pm-follow) .pm-slider{
      left:0;
      right:auto;
      top:0;
      width:50px;
      height:28px;
    }
    .pm-switch:has(#pm-follow) .pm-slider:before{
      left:3px;
      top:3px;
    }
  `;
  document.head.appendChild(s);
}
install();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
