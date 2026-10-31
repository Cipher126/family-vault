export function gridWindow(count:number,width:number,columns:number,gap:number,offset:number,height:number) {
  const size=Math.max(1,(width-gap*(columns-1))/columns),rowSize=size+gap,rows=Math.ceil(count/columns);
  const firstRow=Math.max(0,Math.min(rows,Math.floor(Math.max(0,offset)/rowSize)-4));
  const lastRow=Math.min(rows,Math.ceil((Math.max(0,offset)+height)/rowSize)+4);
  return {start:firstRow*columns,end:Math.min(count,lastRow*columns),top:firstRow*rowSize,height:Math.max(0,rows*rowSize-gap),columns,gap};
}
