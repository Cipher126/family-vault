import type { VerticalFamily, VerticalHousehold } from './familyTreeVertical';

export type DiagramPoint = { x: number; y: number };
export type DiagramNode = { key: string; primaryId: string; personIds: string[]; x: number; y: number; width: number; height: number; role: 'root' | 'partner' | 'child' | 'ancestors' | 'reference'; side: 'left' | 'right' | 'neutral'; childCount: number; expanded: boolean; label?: string };
export type DiagramEdge = { key: string; points: DiagramPoint[]; personIds: string[]; kind: 'parent' | 'partner'; trunkFor?: string; branchFor?: string };
export type DiagramGroup = { key: string; x: number; y: number; width: number; label: string; childCount: number; closed: boolean; parentIds: string[] };
export type FamilyDiagram = { width: number; height: number; nodes: DiagramNode[]; edges: DiagramEdge[]; groups: DiagramGroup[]; junctions: DiagramPoint[]; issues: boolean };
type Options = { width: number; focusId: string; ancestors: boolean; expanded: Set<string>; collapsed?: Set<string>; closedGroups?: Set<string>; all?: boolean; selectedId?: string | null; viewportHeight?: number };

/** Hide unrelated content without moving or resizing any retained box or connector. */
export function isolateFamilyDiagram(diagram: FamilyDiagram, visible: Set<string>): FamilyDiagram {
  const limits = new Map<string, number>();
  for (const edge of diagram.edges) if (edge.branchFor && edge.trunkFor && visible.has(edge.branchFor)) limits.set(edge.trunkFor, Math.max(limits.get(edge.trunkFor) ?? -Infinity, ...edge.points.map(point => point.y)));
  const edges = diagram.edges.filter(edge => edge.personIds.length > 0 && edge.personIds.every(id => visible.has(id))).flatMap(edge => {
    if (!edge.trunkFor || edge.branchFor) return [edge];
    const limit = limits.get(edge.trunkFor);
    if (limit === undefined || edge.points[0].y > limit) return [];
    const points = [edge.points[0]];
    for (let i=1;i<edge.points.length;i++) { const a=edge.points[i-1],b=edge.points[i]; if(b.y<=limit)points.push(b);else{points.push({x:a.x+(b.x-a.x)*(limit-a.y)/(b.y-a.y),y:limit});break;} }
    return points.some(point=>point.x!==points[0].x||point.y!==points[0].y) ? [{...edge,points}] : [];
  });
  const onLine = (point: DiagramPoint) => edges.some(edge => edge.points.slice(1).some((b, index) => {
    const a = edge.points[index], epsilon = .001;
    return (Math.abs(a.x-b.x)<epsilon && Math.abs(point.x-a.x)<epsilon && point.y>=Math.min(a.y,b.y)-epsilon && point.y<=Math.max(a.y,b.y)+epsilon)
      || (Math.abs(a.y-b.y)<epsilon && Math.abs(point.y-a.y)<epsilon && point.x>=Math.min(a.x,b.x)-epsilon && point.x<=Math.max(a.x,b.x)+epsilon);
  }));
  const nodes = diagram.nodes.filter(node => node.personIds.some(id => visible.has(id))).map(node => ({ ...node, personIds: node.personIds.filter(id => visible.has(id)) }));
  const groups = diagram.groups.filter(group => group.parentIds.every(id => visible.has(id)));
  const height = Math.max(120,...nodes.map(node=>node.y+node.height+24),...edges.flatMap(edge=>edge.points.map(point=>point.y+24)),...groups.map(group=>group.y+48));
  return { ...diagram, height, edges, nodes, groups, junctions: diagram.junctions.filter(onLine) };
}

/** All coordinates are screen pixels; additional generations consume vertical space. */
export function layoutFamilyDiagram(family: VerticalFamily, options: Options): FamilyDiagram {
  const width = Math.max(240, options.width);
  const result: FamilyDiagram = { width, height: 300, nodes: [], edges: [], groups: [], junctions: [], issues: false };
  const root = family.people.get(options.focusId);
  if (!root) return result;
  const rootW = Math.min(196, width * .27), rootH = width < 560 ? 150 : 132;
  let sequence = 0;
  const edge = (points: DiagramPoint[], personIds: string[], kind: DiagramEdge['kind'] = 'parent', metadata: Pick<DiagramEdge,'trunkFor'|'branchFor'> = {}) => result.edges.push({ key: `edge-${sequence++}`, points, personIds, kind, ...metadata });
  const node = (value: Omit<DiagramNode, 'key'>, prefix = 'person') => { const item = { ...value, key: `${prefix}-${sequence++}` }; result.nodes.push(item); return item; };
  const partnersOf = (id: string) => [...new Set([...(family.partners.get(id) || []), ...(family.households.get(id) || []).flatMap(group => group.coParentIds)])];
  const cardHeight = (id: string, laneW: number) => (laneW < 360 ? 158 : 126) + Math.max(0, partnersOf(id).length - 1) * 26;
  const open = (id: string) => !options.collapsed?.has(id) && (options.all || options.expanded.has(id));

  function ancestorHeight(id: string, path: Set<string>): number {
    if (!options.ancestors || path.has(id)) return 0;
    const parents = family.parents.get(id) || [];
    if (!parents.length) return 0;
    const next = new Set([...path, id]);
    return parents.reduce((sum, parent) => sum + ancestorHeight(parent, next), 0) + 34 + parents.length * 38 + 24;
  }
  function ancestors(id: string, x: number, top: number, boxW: number, path = new Set<string>()): DiagramNode | null {
    if (!options.ancestors) return null;
    if (path.has(id)) { result.issues = true; return null; }
    const parents = family.parents.get(id) || [];
    if (!parents.length) return null;
    const next = new Set([...path, id]), upstream: { index: number; node: DiagramNode }[] = [];
    let cursor = top;
    parents.forEach((parent, index) => { const item = ancestors(parent, x, cursor, boxW, next); if (item) { upstream.push({ index, node: item }); cursor = item.y + item.height + 24; } });
    const item = node({ primaryId: id, personIds: parents, x: x - boxW / 2, y: cursor, width: boxW, height: 34 + parents.length * 38, role: 'ancestors', side: 'neutral', childCount: 0, expanded: false, label: `Parents of ${family.people.get(id)!.first_name}` }, 'ancestors');
    upstream.forEach(({ index, node: from }) => {
      const gutter = x + (index % 2 ? 1 : -1) * (boxW / 2 + 5), targetY = item.y + 26 + index * 38 + 19;
      edge([{ x, y: from.y + from.height }, { x, y: from.y + from.height + 9 }, { x: gutter, y: from.y + from.height + 9 }, { x: gutter, y: targetY }, { x: x + (index % 2 ? boxW / 2 : -boxW / 2), y: targetY }], [parents[index], ...(family.parents.get(parents[index]) || [])]);
    });
    return item;
  }

  function household(group: VerticalHousehold, x: number, laneW: number, top: number, path: Set<string>, depth: number): number {
    const axis = x + laneW / 2, key = `${[...path].join('/')}/${group.id}`;
    const closed = options.closedGroups?.has(key) || false;
    const names = [group.parentId, ...group.coParentIds].map(id => family.people.get(id)!.first_name).join(' + ');
    result.groups.push({ key, x, y: top, width: laneW, label: names, childCount: group.childIds.length, closed, parentIds: [group.parentId, ...group.coParentIds] });
    result.junctions.push({ x: axis, y: top - 8 });
    if (closed || !group.childIds.length) return top + 52;
    let cursor = top + 42, previousY = top + 34;
    for (const id of group.childIds) {
      const person = family.people.get(id)!;
      const side = person.gender === 'female' ? 'left' : person.gender === 'male' ? 'right' : 'neutral';
      const personW = Math.min(side === 'neutral' ? 240 : 190, laneW * (side === 'neutral' ? .65 : .36));
      const centre = x + laneW * (side === 'left' ? .22 : side === 'right' ? .78 : .5);
      const personH = cardHeight(id, laneW), cycle = path.has(id), expanded = !cycle && !!family.children.get(id)?.length && !!open(id);
      if (cycle) result.issues = true;
      const item = node({ primaryId: id, personIds: [id, ...partnersOf(id)], x: centre - personW / 2, y: cursor, width: personW, height: personH, role: cycle ? 'reference' : 'child', side, childCount: family.children.get(id)?.length || 0, expanded });
      const midY = cursor + personH / 2;
      const joinY = side === 'neutral' ? cursor : midY;
      edge([{ x: axis, y: previousY }, { x: axis, y: joinY }], [group.parentId, ...group.coParentIds], 'parent', {trunkFor:key});
      edge([{ x: axis, y: joinY }, { x: side === 'left' ? item.x + personW : side === 'right' ? item.x : axis, y: joinY }], [id, group.parentId, ...group.coParentIds], 'parent', {trunkFor:key,branchFor:id});
      const bottom = cursor + personH;
      if (expanded) {
        const inset = laneW > 300 ? 12 : 0;
        const nextPath = new Set([...path, id]), innerX = x + inset, innerW = laneW - inset * 2;
        const carryY = bottom + 18, gutter = side === 'right' ? x + 3 : x + laneW - 3;
        edge([{ x: axis, y: side === 'neutral' ? bottom : midY }, { x: axis, y: carryY }, { x: gutter, y: carryY }], [group.parentId, ...group.coParentIds], 'parent', {trunkFor:key});
        let blockTop = bottom + 82;
        const branchX = side === 'right' ? innerX + innerW - 6 : innerX + 6;
        edge([{ x: centre, y: bottom }, { x: centre, y: bottom + 42 }, { x: branchX, y: bottom + 42 }], [id, ...partnersOf(id)]);
        let branchY = bottom + 42;
        for (const nextGroup of family.households.get(id) || []) {
          const jointY = blockTop - 8, nextAxis = innerX + innerW / 2;
          edge([{ x: branchX, y: branchY }, { x: branchX, y: jointY }, { x: nextAxis, y: jointY }], [id, ...nextGroup.coParentIds]);
          blockTop = household(nextGroup, innerX, innerW, blockTop, nextPath, depth + 1) + 44;
          branchY = jointY;
        }
        edge([{ x: gutter, y: carryY }, { x: gutter, y: blockTop - 12 }, { x: axis, y: blockTop - 12 }], [group.parentId, ...group.coParentIds], 'parent', {trunkFor:key});
        previousY = blockTop - 12; cursor = blockTop + 14;
      } else {
        previousY = side === 'neutral' ? bottom : midY;
        cursor = bottom + 30;
      }
    }
    return cursor;
  }

  const groups = family.households.get(root.id) || [];
  const rootPartners = groups.map(group => group.coParentIds);
  const links: { group: VerticalHousehold; x: number; y: number }[] = [];
  let rowTop = 16, firstRoot: DiagramNode | null = null, rootAnchorY = 0;
  const rowCount = Math.max(1, Math.ceil(groups.length / 2));
  for (let row = 0; row < rowCount; row++) {
    const indices = [row * 2, row * 2 + 1].filter(index => index < groups.length);
    const heightFor = (ids: string[]) => ids.reduce((sum, id) => sum + ancestorHeight(id, new Set()), 0);
    const ancestorSpace = Math.max(row === 0 ? ancestorHeight(root.id, new Set()) : 0, ...indices.map(index => heightFor(rootPartners[index]))) + 16;
    const top = rowTop + ancestorSpace;
    const maxCardH = Math.max(rootH, ...indices.map(index => Math.max(rootH, 42 + 48 * rootPartners[index].length)));
    const unionY = top + maxCardH / 2;
    if (row === 0) {
      firstRoot = node({ primaryId: root.id, personIds: [root.id], x: width / 2 - rootW / 2, y: unionY - rootH / 2, width: rootW, height: rootH, role: 'root', side: 'neutral', childCount: family.children.get(root.id)?.length || 0, expanded: true });
      rootAnchorY = unionY;
      const up = ancestors(root.id, width / 2, rowTop, rootW);
      if (up) edge([{ x: width / 2, y: up.y + up.height }, { x: width / 2, y: firstRoot.y }], [root.id, ...(family.parents.get(root.id) || [])]);
    } else edge([{ x: width / 2, y: rootAnchorY }, { x: width / 2, y: unionY }], [root.id], 'partner');
    for (const index of indices) {
      const ids = rootPartners[index];
      const left = indices.length === 1 && ids.length === 1 ? family.people.get(ids[0])?.gender !== 'male' : index % 2 === 0;
      const partnerX = width * (left ? .18 : .82);
      if (!ids.length) { links.push({ group: groups[index], x: width / 2, y: firstRoot ? firstRoot.y + firstRoot.height : unionY }); continue; }
      const height = Math.max(rootH, 42 + ids.length * 48);
      const partner = node({ primaryId: ids[0] || root.id, personIds: ids.length ? ids : [root.id], x: partnerX - rootW / 2, y: unionY - height / 2, width: rootW, height, role: 'partner', side: 'neutral', childCount: groups[index].childIds.length, expanded: true });
      let cursor = rowTop;
      for (const id of ids) {
        const up = ancestors(id, partnerX, cursor, rootW);
        if (up) { edge([{ x: partnerX, y: up.y + up.height }, { x: partnerX, y: partner.y }], [id, ...(family.parents.get(id) || [])]); cursor = up.y + up.height + 24; }
      }
      const nearRoot = row === 0 ? width / 2 + (left ? -rootW / 2 : rootW / 2) : width / 2;
      const nearPartner = partnerX + (left ? rootW / 2 : -rootW / 2), jointX = (nearRoot + nearPartner) / 2;
      edge([{ x: nearRoot, y: unionY }, { x: nearPartner, y: unionY }], [root.id, ...ids], 'partner');
      result.junctions.push({ x: jointX, y: unionY }); links.push({ group: groups[index], x: jointX, y: unionY });
    }
    rootAnchorY = unionY; rowTop = top + maxCardH + 20;
  }
  const columns = width >= 800 ? Math.min(2, groups.length || 1) : 1, gap = 30, laneW = (width - 24 - (columns - 1) * gap) / columns;
  let sectionTop = rowTop + 30;
  for (let index = 0; index < links.length; index += columns) {
    let nextTop = sectionTop;
    for (let column = 0; column < columns && index + column < links.length; column++) {
      const item = links[index + column], laneX = 12 + column * (laneW + gap), axis = laneX + laneW / 2, jointY = sectionTop - 8;
      // Stacked sections keep their source marriage connected along the outer gutter.
      const gutterX = width - 3 - ((index + column) % 4) * 2;
      const direct = columns > 1 || index === 0;
      edge(direct ? [{ x: item.x, y: item.y }, { x: item.x, y: rowTop + 12 }, { x: axis, y: rowTop + 12 }, { x: axis, y: jointY }] : [{ x: item.x, y: item.y }, { x: item.x, y: rowTop + 12 + index * 5 }, { x: gutterX, y: rowTop + 12 + index * 5 }, { x: gutterX, y: jointY }, { x: axis, y: jointY }], [root.id, ...item.group.coParentIds]);
      nextTop = Math.max(nextTop, household(item.group, laneX, laneW, sectionTop, new Set([root.id]), 0) + 50);
    }
    sectionTop = nextTop;
  }
  result.height = Math.max(rowTop + 60, sectionTop, ...result.nodes.map(item => item.y + item.height + 24));
  return result;
}
