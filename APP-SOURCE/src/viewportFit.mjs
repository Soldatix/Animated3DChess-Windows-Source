// Keep baseline horizontal field of view when the viewport is narrow.
export function verticalFovForAspect(aspect,baseline=40,reference=16/9){
  if(!Number.isFinite(aspect)||aspect<=0)return baseline;
  return Math.min(140,2*Math.atan(Math.tan(baseline*Math.PI/360)*Math.max(1,reference/aspect))*180/Math.PI);
}
