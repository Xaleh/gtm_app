// Animações em pixel art de todos os movimentos da planilha.
// Cena 112×64 px desenhada num buffer de paleta e ampliada com image-rendering: pixelated.
(function (root) {
  const W = 112, H = 64, SC = 26, GY = 59, FPS = 12;
  const D2R = Math.PI / 180;

  // ---------- paleta ----------
  const HEX = {
    ol: "#14161f", skin: "#f0b98d", skinS: "#c98a62", hair: "#3a2618", sing: "#3b6cf0", singS: "#2648b8",
    shorts: "#2a2d36", shortsS: "#1c1e25", shoe: "#e9ecef", belt: "#8a4b26", metal: "#9aa3b0", metalD: "#5d6573",
    pad: "#3d4357", padL: "#565e78", wood: "#b07a45", woodD: "#7e5530", wall: "#1b2030", wallL: "#232a3d", rubber: "#2b2f38",
    rubberL: "#353a45", cable: "#c9ced6", stick: "#d9a35b", hi: "#ffffff",
    p25: "#d62828", p20: "#1f4fd8", p15: "#e6b800", p10: "#178a45", p5: "#eef0f2", p2: "#2a2e36", p1: "#b9bec6",
  };
  const NAMES = Object.keys(HEX), IDX = {}, RGB = [[0, 0, 0]];
  NAMES.forEach((n, i) => { IDX[n] = i + 1; const h = HEX[n]; RGB.push([parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]); });
  const C = IDX;

  // ---------- matemática ----------
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const v = (x, y) => ({ x, y });
  const along = (P, ang, len) => v(P.x + Math.sin(ang) * len, P.y + Math.cos(ang) * len);
  const mix = (A, B, t) => v(lerp(A.x, B.x, t), lerp(A.y, B.y, t));
  function ik(A, B, l1, l2, pick) {
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
    const dc = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
    const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const ux = dx / (d || 1), uy = dy / (d || 1), px = A.x + ux * a, py = A.y + uy * a;
    return pick(v(px - uy * h, py + ux * h), v(px + uy * h, py - ux * h));
  }
  const FWD = (a, b) => a.x > b.x ? a : b, BACK = (a, b) => a.x < b.x ? a : b;
  const LOW = (a, b) => a.y < b.y ? a : b, HIGH = (a, b) => a.y > b.y ? a : b;
  const LEN = { shin: .44, thigh: .44, torso: .52, ua: .3, fa: .27, arm: .55 };
  const ANK = v(0, .08), MID = .05;

  // ---------- rasterização ----------
  function Canvas(camX) {
    const layers = { bk: new Uint8Array(W * H), fig: new Uint8Array(W * H), fr: new Uint8Array(W * H) };
    const px = P => [W / 2 + (P.x - camX) * SC, GY - P.y * SC];
    function cap(L, A, B, r, c) {
      const [ax, ay] = px(A), [bx, by] = px(B), buf = layers[L];
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1));
      const dx = bx - ax, dy = by - ay, ll = dx * dx + dy * dy || 1e-9, rr = r * r + r * .35;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const cx = x + .5, cy = y + .5;
        const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / ll));
        const ex = ax + dx * t - cx, ey = ay + dy * t - cy;
        if (ex * ex + ey * ey <= rr) buf[y * W + x] = c;
      }
    }
    const disc = (L, P, r, c) => cap(L, P, P, r, c);
    function rect(L, x0, y0, x1, y1, c) { // coordenadas do mundo
      const [a, b] = px(v(x0, y1)), [d, e] = px(v(x1, y0)), buf = layers[L];
      for (let y = Math.max(0, Math.round(b)); y < Math.min(H, Math.round(e)); y++)
        for (let x = Math.max(0, Math.round(a)); x < Math.min(W, Math.round(d)); x++) buf[y * W + x] = c;
    }
    function dot(L, P, c, ox, oy) { const [x, y] = px(P); const X = Math.floor(x + (ox || 0)), Y = Math.floor(y + (oy || 0)); if (X >= 0 && X < W && Y >= 0 && Y < H) layers[L][Y * W + X] = c; }
    // traço com contorno próprio (separa um membro do corpo atrás dele)
    function limb(L, A, B, r, c) { cap(L, A, B, r + 1, C.ol); cap(L, A, B, r, c); }
    return { layers, cap, disc, rect, dot, limb, px };
  }

  function outline(buf) {
    const out = buf.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (buf[i]) continue;
      if ((x > 0 && buf[i - 1]) || (x < W - 1 && buf[i + 1]) || (y > 0 && buf[i - W]) || (y < H - 1 && buf[i + W])) out[i] = C.ol;
    }
    return out;
  }

  function scene(img, kind) {
    const d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c;
      if (y < GY - 1) c = (y % 16 === 15) ? C.wallL : (y > GY - 9 && (x + y) % 2 === 0 ? C.wallL : C.wall);
      else if (kind === "platform") c = y === GY - 1 ? C.woodD : (Math.abs(x - W / 2) > 40 ? C.rubber : ((x + (y > GY + 1 ? 7 : 0)) % 14 === 0 ? C.woodD : C.wood));
      else c = y === GY - 1 ? C.rubberL : ((x * 3 + y) % 11 === 0 ? C.rubberL : C.rubber);
      const k = (y * W + x) * 4, rgb = RGB[c]; d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; d[k + 3] = 255;
    }
  }
  function compose(img, layers) {
    const d = img.data;
    for (const L of [outline(layers.bk), outline(layers.fig), outline(layers.fr)])
      for (let i = 0; i < W * H; i++) if (L[i]) { const rgb = RGB[L[i]], k = i * 4; d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; }
  }

  // ---------- atleta (vista lateral, olhando para +x) ----------
  function side(K, J, o) {
    o = o || {};
    const torsoAng = Math.atan2(J.sh.x - J.hip.x, J.sh.y - J.hip.y);
    const head = J.head || along(J.sh, torsoAng * (o.neck ?? .55), .17);
    const face = o.face || v(Math.cos(torsoAng * .55), -Math.sin(torsoAng * .55));
    const toe = P => J.toe || v(P.x + .16, P.y - .05);
    const F = J.far || {};
    const fk = F.knee || v(J.knee.x - .03, J.knee.y), fa = F.ankle || v(J.ankle.x - .03, J.ankle.y);
    const fe = F.elbow || v(J.elbow.x - .03, J.elbow.y + .01), fh = F.hand || v(J.hand.x - .03, J.hand.y + .01);
    const ft = F.toe || (F.ankle ? toe(fa) : v(toe(J.ankle).x - .03, toe(J.ankle).y));
    // perna e braço do fundo
    K.cap("fig", J.hip, fk, 2.6, C.skinS); K.cap("fig", J.hip, mix(J.hip, fk, .45), 2.9, C.shortsS);
    K.cap("fig", fk, fa, 2, C.skinS); K.cap("fig", fa, ft, 1.5, C.metalD);
    K.cap("fig", J.sh, fe, 1.8, C.skinS); K.cap("fig", fe, fh, 1.6, C.skinS);
    // tronco, cinto, cabeça
    K.cap("fig", J.hip, J.sh, 3.6, C.sing); K.cap("fig", mix(J.hip, J.sh, .55), J.sh, 3.2, C.sing);
    K.cap("fig", mix(J.hip, J.sh, .2), mix(J.hip, J.sh, .9), 1.2, C.singS);
    K.cap("fig", J.hip, mix(J.hip, J.sh, .2), 3.9, C.shorts);
    if (o.belt) K.cap("fig", mix(J.hip, J.sh, .22), mix(J.hip, J.sh, .38), 3.9, C.belt);
    K.cap("fig", J.sh, head, 1.6, C.skin);
    drawHead(K, "fig", head, face);
    // perna e braço da frente
    K.limb("fig", J.hip, J.knee, 2.7, C.skin); K.cap("fig", J.hip, mix(J.hip, J.knee, .45), 3, C.shorts);
    K.limb("fig", J.knee, J.ankle, 2.1, C.skin);
    K.limb("fig", J.ankle, toe(J.ankle), 1.6, C.shoe);
    if (!o.noArm) {
      K.limb("fig", J.sh, J.elbow, 1.9, C.skin); K.cap("fig", J.sh, mix(J.sh, J.elbow, .3), 2.2, C.sing);
      K.limb("fig", J.elbow, J.hand, 1.7, C.skin); K.disc("fig", J.hand, 1.8, C.skin);
    }
    return { head, face };
  }
  function drawHead(K, L, head, face) {
    K.disc(L, head, 3.7, C.hair);
    const [hx, hy] = K.px(head);
    const fx = { x: hx + face.x * 1.1, y: hy + face.y * 1.1 };
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      const X = Math.floor(fx.x + x), Y = Math.floor(fx.y + y);
      if ((x * x + y * y) <= 9.5 && X >= 0 && X < W && Y >= 0 && Y < H) {
        // só a metade "da frente" vira rosto
        if ((x * face.x + y * face.y) > -1.2) K.layers[L][Y * W + X] = C.skin;
      }
    }
    const ey = Math.floor(fx.y - face.x * .8 + face.y * 1.2), ex = Math.floor(fx.x + face.x * 1.6 + face.y * .5);
    if (ey >= 0 && ey < H && ex >= 0 && ex < W) K.layers[L][ey * W + ex] = C.ol;
  }
  // ---------- atleta (vista de frente) ----------
  function front(K, J) {
    const hipC = mix(J.hipL, J.hipR, .5), shC = mix(J.shL, J.shR, .5), head = v(shC.x, shC.y + .2);
    for (const s of ["L", "R"]) {
      K.limb("fig", J["hip" + s], J["k" + s], 2.6, C.skin); K.cap("fig", J["hip" + s], mix(J["hip" + s], J["k" + s], .5), 2.9, C.shorts);
      K.limb("fig", J["k" + s], J["a" + s], 2, C.skin);
      K.cap("fig", J["a" + s], v(J["a" + s].x + (s === "L" ? -.03 : .03), J["a" + s].y - .05), 1.8, C.shoe);
    }
    K.cap("fig", J.hipL, J.hipR, 3.4, C.shorts);
    K.cap("fig", mix(hipC, shC, .2), shC, 4.2, C.sing); K.cap("fig", J.shL, J.shR, 2.6, C.sing);
    K.cap("fig", J.shL, mix(J.shL, hipC, .5), 2.4, C.sing); K.cap("fig", J.shR, mix(J.shR, hipC, .5), 2.4, C.sing);
    K.cap("fig", hipC, mix(hipC, shC, .22), 3.6, C.shorts);
    K.cap("fig", shC, head, 1.7, C.skin);
    K.disc("fig", head, 3.7, C.hair); K.disc("fig", v(head.x, head.y - .03), 3.1, C.skin);
    K.dot("fig", head, C.ol, -1.5, 0); K.dot("fig", head, C.ol, 1.2, 0);
    for (const s of ["L", "R"]) {
      K.limb("fig", J["sh" + s], J["el" + s], 1.9, C.skin); K.limb("fig", J["el" + s], J["h" + s], 1.7, C.skin);
      K.disc("fig", J["h" + s], 1.8, C.skin);
    }
  }

  // ---------- equipamentos ----------
  const PLATE = { 25: "p25", 20: "p20", 15: "p15", 10: "p10", 5: "p5", 2.5: "p2", 1.25: "p1" };
  function plate(K, L, P, col, r) { K.disc(L, P, r || 5.9, C[col] || C.p20); K.disc(L, P, 1.4, C.metal); K.dot(L, P, C.hi, -.5, -.5); }
  function dbEnd(K, L, P) { K.disc(L, P, 2.4, C.metalD); K.disc(L, P, 1.2, C.metal); }
  function dbLong(K, L, P, ang) { // halter visto de lado, ang = direção do cabo
    const a = along(P, ang, .13), b = along(P, ang + Math.PI, .13);
    K.cap(L, a, b, .9, C.metal); K.cap(L, along(P, ang, .1), along(P, ang, .16), 2.2, C.metalD); K.cap(L, along(P, ang + Math.PI, .1), along(P, ang + Math.PI, .16), 2.2, C.metalD);
  }
  function bench(K, x0, x1, y, legs) {
    K.rect("bk", x0, y - .06, x1, y, C.pad); K.rect("bk", x0, y - .015, x1, y, C.padL);
    for (const x of legs || [x0 + .08, x1 - .1]) K.rect("bk", x, 0, x + .05, y - .06, C.metalD);
  }
  function post(K, x, top) { K.rect("bk", x, 0, x + .07, top, C.metalD); K.rect("bk", x + .02, 0, x + .035, top, C.metal); }
  function pulley(K, P) { K.disc("bk", P, 2.2, C.metal); K.disc("bk", P, .8, C.metalD); }

  // ---------- poses dos levantamentos ----------
  const legsTo = hip => ik(ANK, hip, LEN.shin, LEN.thigh, FWD);
  function squat(p) {
    const hip = v(lerp(-.02, -.25, p), lerp(.935, .36, p));
    const c = Math.asin(Math.min(.95, (MID + .03 - hip.x) / LEN.torso)), sh = along(hip, c, LEN.torso);
    const bar = v(sh.x - Math.cos(c) * .05, sh.y - Math.sin(c) * .05 - .03), hand = v(bar.x + .04, bar.y - .01);
    return { hip, sh, bar, hand, elbow: ik(sh, hand, .2, .2, BACK), knee: legsTo(hip), ankle: ANK };
  }
  function hinge(p, maxDeg, hipTop, hipBot) {
    const c = lerp(0, maxDeg, p) * D2R, hip = v(MID + .02 - LEN.torso * Math.sin(c), lerp(hipTop, hipBot, p));
    const sh = along(hip, c, LEN.torso), bar = v(sh.x, sh.y - LEN.arm);
    return { hip, sh, bar, hand: bar, elbow: v(sh.x + .01, sh.y - LEN.arm / 2), knee: legsTo(hip), ankle: ANK };
  }
  const dead = p => hinge(p, 58, .94, .5);

  // ---------- catálogo ----------
  const P = (from, to, dur, label) => ({ from, to, dur, label });
  const acc = (up, down, opts) => { opts = opts || {}; return [P(0, 0, opts.hold0 ?? .4, opts.start || ""), P(0, 1, opts.t1 ?? .9, up), P(1, 1, opts.hold1 ?? .3, opts.top || ""), P(1, 0, opts.t2 ?? 1.2, down)]; };
  const alt = (a, b) => [P(0, 1, .9, a), P(1, 1, .7, "Segura"), P(1, 0, .8, ""), P(0, -1, .9, b), P(-1, -1, .7, "Segura"), P(-1, 0, .8, "")];

  const EX = {
    S: { scene: "platform", cam: -.05, draw(K, p, o) {
      const J = squat(p), h = side(K, J, { belt: true, neck: .3 });
      plate(K, "fr", J.bar, o.plate); drawHead(K, "fr", h.head, h.face);
    } },
    D: { scene: "platform", cam: -.1, draw(K, p, o) {
      const J = dead(p); side(K, J, { belt: true, neck: .45 }); plate(K, "fr", J.bar, o.plate);
    } },
    B: { scene: "platform", cam: -.2, draw(K, p, o) {
      const sh = v(.08, .55), hip = v(-.42, .55);
      bench(K, -.62, .26, .5, [-.5, .12]); post(K, .42, 1.3); K.rect("bk", .32, 1.08, .42, 1.12, C.metal);
      const bar = v(lerp(.08, -.03, p), lerp(sh.y + LEN.ua + LEN.fa, .69, p));
      const elbow = ik(sh, bar, LEN.ua, LEN.fa, LOW);
      const ankle = o.para ? v(-.78, .86) : v(-.82, .08), knee = o.para ? v(-.62, .78) : ik(ankle, hip, LEN.shin, LEN.thigh, HIGH);
      side(K, { hip, sh, knee, ankle, elbow, hand: bar, head: v(.24, .6), toe: o.para ? v(-.9, .9) : null }, { face: v(0, -1) });
      plate(K, "fr", bar, o.plate);
    } },
    STIFF: { scene: "platform", cam: -.15, draw(K, p, o) {
      const J = hinge(p, o.deep ? 100 : 75, .94, o.deep ? .86 : .8);
      side(K, J, { neck: .5 }); plate(K, "fr", J.bar, o.deep ? "p10" : (o.plate || "p20"), o.deep ? 3.5 : 5.9);
    } },
    ROW: { scene: "platform", cam: -.15, draw(K, p, o) {
      const c = 80 * D2R, hip = v(MID + .02 - LEN.torso * Math.sin(c), .72), sh = along(hip, c, LEN.torso);
      const bar = v(lerp(sh.x, sh.x - .12, p), lerp(.235, sh.y - .07, p));
      side(K, { hip, sh, bar, hand: bar, elbow: ik(sh, bar, LEN.ua, LEN.fa, HIGH), knee: legsTo(hip), ankle: ANK }, { neck: .35 });
      plate(K, "fr", bar, o.plate || "p20");
    } },
    INCLINE: { scene: "gym", cam: -.15, draw(K, p) {
      const hip = v(-.12, .52), ang = -58 * D2R, sh = along(hip, ang, LEN.torso), head = along(sh, ang, .17);
      K.cap("bk", v(hip.x + .02, hip.y - .1), along(v(hip.x + .02, hip.y - .1), ang, .78), 2.6, C.pad);
      bench(K, -.3, .14, .44, [-.22, .05]); K.rect("bk", -.55, 0, -.5, .5, C.metalD);
      const hand = v(lerp(sh.x + .05, sh.x + .14, p), lerp(sh.y + LEN.ua + LEN.fa - .02, sh.y + .06, p));
      const ankle = v(.4, .08), knee = ik(ankle, hip, LEN.shin, LEN.thigh, HIGH);
      side(K, { hip, sh, knee, ankle, hand, elbow: ik(sh, hand, LEN.ua, LEN.fa, LOW), head }, { face: v(.55, -.8) });
      dbEnd(K, "fr", hand);
    } },
    PECDECK: { scene: "gym", cam: 0, draw(K, p) {
      K.rect("bk", -.62, 0, -.55, 1.75, C.metalD); K.rect("bk", .55, 0, .62, 1.75, C.metalD); K.rect("bk", -.62, 1.7, .62, 1.76, C.metalD);
      K.rect("bk", -.2, .45, .2, 1.15, C.pad); K.rect("bk", -.22, .4, .22, .48, C.pad); K.rect("bk", -.03, 0, .03, .4, C.metalD);
      const y = 1.0, ex = lerp(.52, .17, p);
      const J = { shL: v(-.2, y), shR: v(.2, y), elL: v(-ex, y - .02), elR: v(ex, y - .02), hL: v(-ex * .9, y + .26), hR: v(ex * .9, y + .26),
        hipL: v(-.12, .52), hipR: v(.12, .52), kL: v(-.16, .46), kR: v(.16, .46), aL: v(-.18, .08), aR: v(.18, .08) };
      front(K, J);
      for (const s of [-1, 1]) K.rect("fr", s * ex - .04, y - .04, s * ex + .04, y + .3, C.padL);
    } },
    LATRAISE: { scene: "gym", cam: 0, draw(K, p) {
      const a = lerp(12, 86, p) * D2R, y = 1.4, J = { shL: v(-.2, y), shR: v(.2, y), hipL: v(-.12, .93), hipR: v(.12, .93), kL: v(-.13, .5), kR: v(.13, .5), aL: v(-.14, .08), aR: v(.14, .08) };
      for (const [s, k] of [[-1, "L"], [1, "R"]]) {
        const sh = J["sh" + k], el = v(sh.x + s * Math.sin(a) * LEN.ua, sh.y - Math.cos(a) * LEN.ua), h = v(el.x + s * Math.sin(a + .15) * LEN.fa, el.y - Math.cos(a + .15) * LEN.fa);
        J["el" + k] = el; J["h" + k] = h;
      }
      front(K, J); dbEnd(K, "fr", J.hL); dbEnd(K, "fr", J.hR);
    } },
    FRONTRAISE: { scene: "gym", cam: -.05, draw(K, p) {
      const hip = v(0, .93), sh = v(.02, 1.45), a = lerp(170, 88, p) * D2R;
      const elbow = along(sh, a, LEN.ua), hand = along(elbow, a - .05, LEN.fa);
      side(K, { hip, sh, knee: v(.03, .51), ankle: ANK, elbow, hand }, {});
      dbLong(K, "fr", hand, a - Math.PI / 2);
    } },
    CURL: { scene: "gym", cam: 0, draw(K, p, o) {
      const hip = v(0, .93), sh = v(.02, 1.45), elbow = v(.05, 1.16), a = lerp(176, 30, p) * D2R, hand = along(elbow, a, LEN.fa);
      side(K, { hip, sh, knee: v(.03, .51), ankle: ANK, elbow, hand, far: { elbow: v(.02, 1.16), hand: along(v(.02, 1.17), a, LEN.fa) } }, {});
      if (o.hammer) dbLong(K, "fr", hand, a + Math.PI / 2); else dbEnd(K, "fr", hand);
    } },
    FRENCH: { scene: "gym", cam: 0, draw(K, p) {
      const hip = v(0, .93), sh = v(.02, 1.45), elbow = v(.07, 1.75), a = lerp(-150, 2, p) * D2R, hand = along(elbow, a, LEN.fa);
      side(K, { hip, sh, knee: v(.03, .51), ankle: ANK, elbow, hand }, {});
      dbLong(K, "fr", along(hand, a, .05), a);
    } },
    PUSHDOWN: { scene: "gym", cam: .15, draw(K, p) {
      post(K, .66, 2.2); const top = v(.62, 2.12); pulley(K, top);
      const hip = v(-.02, .93), sh = v(.06, 1.44), elbow = v(.1, 1.15), a = lerp(55, 172, p) * D2R, hand = along(elbow, a, LEN.fa);
      K.cap("bk", top, hand, .4, C.cable);
      side(K, { hip, sh, knee: v(.04, .51), ankle: ANK, elbow, hand }, { neck: 1.2 });
      K.cap("fr", v(hand.x - .06, hand.y + .02), v(hand.x + .06, hand.y - .02), 1, C.metal);
    } },
    PULLDOWN: { scene: "gym", cam: .05, draw(K, p) {
      post(K, .78, 2.25); const top = v(.24, 2.18); pulley(K, top); K.rect("bk", .24, 2.15, .82, 2.21, C.metalD);
      const hip = v(-.05, .55), sh = along(hip, -15 * D2R, LEN.torso);
      K.rect("bk", -.25, .43, .2, .5, C.pad); K.rect("bk", -.03, 0, .03, .43, C.metalD); K.rect("fr", .32, .62, .5, .7, C.padL); K.rect("bk", .5, .5, .78, .56, C.metalD);
      const hand = v(lerp(sh.x + .22, sh.x + .2, p), lerp(sh.y + .56, sh.y + .02, p));
      K.cap("bk", top, hand, .4, C.cable);
      const ankle = v(.42, .08), knee = v(.38, .52);
      side(K, { hip, sh, knee, ankle, hand, elbow: ik(sh, hand, LEN.ua, LEN.fa, BACK) }, { neck: .2 });
      K.disc("fr", hand, 1.3, C.metal);
    } },
    SEATROW: { scene: "gym", cam: .25, draw(K, p) {
      post(K, 1.02, 1.0); const pul = v(1.0, .52); pulley(K, pul);
      K.rect("bk", -.35, .35, .3, .42, C.pad); K.rect("bk", -.1, 0, -.04, .35, C.metalD); K.rect("bk", .66, 0, .72, .55, C.metalD);
      const hip = v(-.08, .47), sh = along(hip, lerp(12, -6, p) * D2R, LEN.torso), ankle = v(.66, .32);
      const hand = v(lerp(.62, hip.x + .22, p), lerp(.62, .7, p));
      K.cap("bk", pul, hand, .4, C.cable);
      side(K, { hip, sh, knee: ik(ankle, hip, LEN.shin, LEN.thigh, HIGH), ankle, toe: v(.7, .45), hand, elbow: ik(sh, hand, LEN.ua, LEN.fa, LOW) }, { neck: .2 });
      K.cap("fr", v(hand.x, hand.y + .05), v(hand.x, hand.y - .05), 1, C.metal);
    } },
    LEGPRESS: { scene: "gym", cam: .15, draw(K, p) {
      const u = v(Math.SQRT1_2, Math.SQRT1_2), n = v(-Math.SQRT1_2, Math.SQRT1_2);
      const hip = v(-.38, .44), ang = -62 * D2R, sh = along(hip, ang, LEN.torso);
      K.cap("bk", v(-.2, .12), v(-.2 + u.x * 2.2, .12 + u.y * 2.2), 1.6, C.metalD);
      K.cap("bk", v(hip.x + .05, hip.y - .1), along(v(hip.x + .05, hip.y - .1), ang, .75), 2.6, C.pad); K.rect("bk", -.55, .34, -.15, .4, C.pad); K.rect("bk", -.6, 0, -.1, .34, C.metalD);
      const d = lerp(.84, .42, p), F = v(hip.x + u.x * d + .05, hip.y + u.y * d + .05);
      const knee = ik(F, hip, LEN.shin, LEN.thigh, HIGH);
      side(K, { hip, sh, knee, ankle: F, toe: v(F.x + n.x * .15, F.y + n.y * .15), hand: v(hip.x + .1, hip.y + .03), elbow: v(hip.x + .05, hip.y + .25) }, { face: v(.7, -.7) });
      const pl = v(F.x + u.x * .08, F.y + u.y * .08);
      K.cap("fr", v(pl.x - n.x * .3, pl.y - n.y * .3), v(pl.x + n.x * .3, pl.y + n.y * .3), 1.4, C.metal);
      K.cap("fr", pl, v(pl.x + u.x * .25, pl.y + u.y * .25), 2.6, C.metalD);
      plate(K, "fr", v(pl.x + u.x * .45 + n.x * .05, pl.y + u.y * .45 + n.y * .05), "p20", 4.5);
    } },
    LEGEXT: { scene: "gym", cam: .05, draw(K, p) {
      const hip = v(-.12, .56), sh = along(hip, -4 * D2R, LEN.torso), knee = v(.32, .56);
      K.rect("bk", -.34, .46, .34, .53, C.pad); K.rect("bk", -.4, .46, -.33, 1.15, C.pad); K.rect("bk", -.05, 0, .02, .46, C.metalD);
      const a = lerp(188, 92, p) * D2R, ankle = along(knee, a, LEN.shin);
      K.cap("bk", knee, along(knee, a, .5), 1.2, C.metalD); K.disc("fr", along(knee, a, .47), 2.2, C.padL);
      side(K, { hip, sh, knee, ankle, toe: along(ankle, a - Math.PI / 2, .15), hand: v(.0, .52), elbow: v(-.02, .8) }, {});
    } },
    LEGCURL: { scene: "gym", cam: .05, draw(K, p) {
      bench(K, -.85, .4, .6, [-.75, .3]);
      const hip = v(-.05, .69), sh = v(-.57, .7), knee = v(.4, .67), a = lerp(92, 15, p) * D2R, ankle = along(knee, a, LEN.shin);
      K.cap("bk", knee, along(knee, a, .52), 1.2, C.metalD); K.disc("fr", along(along(knee, a, .46), 0, .07), 2.2, C.padL);
      side(K, { hip, sh, knee, ankle, toe: along(ankle, a + Math.PI / 2, .14), hand: v(-.85, .62), elbow: v(-.7, .62), head: v(-.72, .76) }, { face: v(-.6, .8) });
    } },
    HIPTHRUST: { scene: "gym", cam: -.15, draw(K, p, o) {
      K.rect("bk", -1.0, 0, -.42, .42, C.pad); K.rect("bk", -1.0, .38, -.42, .42, C.padL);
      const sh = v(-.44, .48), hip = v(lerp(-.08, .04, p), lerp(.24, .5, p)), ankle = v(.42, .08);
      const knee = ik(ankle, hip, LEN.shin, LEN.thigh, HIGH), bar = v(hip.x + .02, hip.y + .13);

      side(K, { hip, sh, knee, ankle, hand: v(bar.x - .03, bar.y + .02), elbow: v(sh.x + .12, sh.y + .1), head: v(sh.x - .12, sh.y + .1) }, { face: v(.3, -.9) });
      plate(K, "fr", bar, o.plate || "p20", 5.2);
    } },
    ABD: { scene: "gym", cam: 0, draw(K, p, o) {
      K.rect("bk", -.25, .45, .25, 1.15, C.pad); K.rect("bk", -.28, .4, .28, .48, C.pad); K.rect("bk", -.03, 0, .03, .4, C.metalD);
      const t = o.add ? 1 - p : p, kx = lerp(.15, .42, t);
      front(K, { shL: v(-.2, 1.02), shR: v(.2, 1.02), elL: v(-.27, .76), elR: v(.27, .76), hL: v(-.3, .52), hR: v(.3, .52), hipL: v(-.12, .52), hipR: v(.12, .52), kL: v(-kx, .47), kR: v(kx, .47), aL: v(-kx * .9, .1), aR: v(kx * .9, .1) });
      for (const s of [-1, 1]) { const x = s * (kx + (o.add ? -.07 : .07)); K.rect("fr", x - .03, .3, x + .03, .52, C.padL); }
    } },
    PLANK: { scene: "gym", cam: -.25, draw(K, p) {
      const b = Math.sin(p * Math.PI) * .015, sh = v(.24, .36), hip = v(-.3, .3 + b), ankle = v(-1.1, .07);
      side(K, { hip, sh, knee: mix(hip, ankle, .5), ankle, toe: v(-1.13, .02), elbow: v(.26, .05), hand: v(.5, .05), head: v(.4, .42) }, { face: v(.7, .6) });
    } },
    DEADBUG: { scene: "gym", cam: -.15, draw(K, p) {
      const a = Math.max(p, 0), b = Math.max(-p, 0), sh = v(.25, .15), hip = v(-.27, .15);
      const arm = t => mix(v(.27, .7), v(.82, .2), t), elb = t => mix(v(.26, .43), v(.52, .24), t);
      const kn = t => mix(v(-.27, .58), v(-.7, .22), t), an = t => mix(v(.15, .58), v(-1.12, .14), t);
      side(K, { hip, sh, knee: kn(b), ankle: an(b), toe: v(an(b).x + .03, an(b).y + .14), elbow: elb(a), hand: arm(a), head: v(.42, .19),
        far: { knee: kn(a), ankle: an(a), toe: v(an(a).x + .03, an(a).y + .14), elbow: elb(b), hand: arm(b) } }, { face: v(0, -1) });
    } },
    BIRDDOG: { scene: "gym", cam: -.15, draw(K, p) {
      const a = Math.max(p, 0), b = Math.max(-p, 0), sh = v(.3, .62), hip = v(-.25, .6);
      const hand = t => mix(v(.32, .07), v(.88, .66), t), elb = t => mix(v(.31, .34), v(.6, .65), t);
      const kn = t => mix(v(-.24, .12), v(-.67, .6), t), an = t => mix(v(-.67, .08), v(-1.1, .62), t);
      side(K, { hip, sh, knee: kn(b), ankle: an(b), toe: v(an(b).x - .14, an(b).y - .02), elbow: elb(a), hand: hand(a), head: v(.46, .7),
        far: { knee: kn(a), ankle: an(a), toe: v(an(a).x - .14, an(a).y - .02), elbow: elb(b), hand: hand(b) } }, { face: v(.6, .8) });
    } },
    ANKLE: { scene: "gym", cam: .05, draw(K, p) {
      K.rect("bk", .92, 0, 1.2, 2.3, C.wallL);
      const ankle = v(.28, .08), knee = along(ankle, lerp(18, 42, p) * D2R, LEN.shin), hip = v(lerp(-.32, -.18, p), .5), sh = along(hip, 5 * D2R, LEN.torso);
      side(K, { hip, sh, knee, ankle, hand: v(.88, 1.05), elbow: v(.62, .92), far: { knee: v(-.36, .06), ankle: v(-.78, .07), toe: v(-.9, .05) } }, {});
    } },
    SHOULDER: { scene: "gym", cam: 0, draw(K, p) {
      const hip = v(0, .93), sh = v(.02, 1.45), a = lerp(165, -150, p) * D2R, hand = along(sh, a, LEN.arm), elbow = along(sh, a, LEN.ua);
      side(K, { hip, sh, knee: v(.03, .51), ankle: ANK, elbow, hand }, {});
      K.disc("fr", hand, 1.6, C.stick);
    } },
    POSTLEG: { scene: "gym", cam: -.2, draw(K, p) {
      const a = Math.max(p, 0), b = Math.max(-p, 0), sh = v(.25, .15), hip = v(-.27, .15);
      const leg = t => { const ang = lerp(-89, -8, t) * D2R; return { knee: along(hip, ang, LEN.thigh), ankle: along(hip, ang, LEN.thigh + LEN.shin) }; };
      const N = leg(a), F = leg(b);
      side(K, { hip, sh, knee: N.knee, ankle: N.ankle, toe: along(N.ankle, (lerp(-89, -8, a) + 90) * D2R, .14), elbow: v(.0, .12), hand: v(-.25, .12), head: v(.42, .19),
        far: { knee: F.knee, ankle: F.ankle, toe: along(F.ankle, (lerp(-89, -8, b) + 90) * D2R, .14) } }, { face: v(0, -1) });
    } },
  };

  // ---------- reconhecer exercício da planilha ----------
  function specFor(ex) {
    const n = (ex.name + " " + (ex.note || "")).toLowerCase();
    let key = null;
    const map = [
      [/supino inclinado/, "INCLINE"], [/^supino/, "B"], [/^agach/, "S"], [/^deadlift|^terra|levantamento terra/, "D"],
      [/stiff/, "STIFF"], [/remada pendlay/, "ROW"], [/remada baixa/, "SEATROW"], [/puxada/, "PULLDOWN"],
      [/rosca martelo/, "CURL"], [/rosca/, "CURL"], [/tr[ií]ceps franc/, "FRENCH"], [/tr[ií]ceps (polia|corda|pulley)/, "PUSHDOWN"],
      [/crucifixo|peck|voador/, "PECDECK"], [/eleva[cç][aã]o p[eé]lvica|hip thrust/, "HIPTHRUST"], [/elev\.? ?frontal/, "FRONTRAISE"],
      [/elev\.? ?lateral/, "LATRAISE"], [/extensora/, "LEGEXT"], [/flexora/, "LEGCURL"], [/leg ?press/, "LEGPRESS"],
      [/abdutor/, "ABD"], [/adutor/, "ABD"], [/prancha/, "PLANK"], [/dead ?bug/, "DEADBUG"], [/bird ?dog/, "BIRDDOG"],
      [/tornozelo/, "ANKLE"], [/ombro/, "SHOULDER"], [/posterior/, "POSTLEG"],
    ];
    for (const [re, k] of map) if (re.test(n)) { key = k; break; }
    if (!key) return null;
    const o = { key, pause: 0, desc: null, up: null, knee: false, off: false, tng: /touch/.test(n), para: /paral/.test(n),
      hammer: /martelo/.test(n), add: /^adutor/.test(n.trim()), deep: false };
    if (key === "POSTLEG" && /crg|carga/.test(n)) { o.key = key = "STIFF"; o.deep = true; }
    const pm = n.match(/pausa\s*(?:de\s*)?(\d+)\s*(?:a\s*\d+\s*)?s/);
    if (/pausa longa/.test(n)) o.pause = 3;
    if (pm) o.pause = +pm[1];
    if (key === "D" && /joelho/.test(n)) { o.knee = true; o.pause = o.pause || 2; }
    else if (key === "D" && /sa[ií]da/.test(n)) { o.off = true; o.pause = o.pause || 2; }
    else if (!o.pause && /(c\/|com|c)\s+pausa/.test(n)) o.pause = 2;
    const dm = n.match(/(?:descida lenta|desce em)\s*(\d+)\s*s/); if (dm) o.desc = +dm[1];
    const um = n.match(/sobe em\s*(\d+)\s*s/); if (um) o.up = +um[1];
    if (key === "B" && !o.pause && !o.tng && ex.kind !== "warmup") o.compPause = true;
    o.phases = phases(o);
    return o;
  }

  function kneeP() { for (let p = 1; p >= 0; p -= .01) { const J = dead(p); if (J.bar.y >= legsTo(J.hip).y + .02) return p; } return .5; }

  function phases(o) {
    switch (o.key) {
      case "D": {
        const out = [P(1, 1, .8, "Prepara")];
        if (o.knee || o.off) {
          const t = o.off ? .85 : kneeP();
          out.push(P(1, t, o.off ? .5 : .9, "Puxa"), P(t, t, o.pause, o.knee ? `Pausa no joelho ${o.pause}s` : `Pausa ${o.pause}s`), P(t, 0, .8, "Termina a puxada"));
        } else out.push(P(1, 0, 1.3, "Puxa"));
        out.push(P(0, 0, .6, "Trava em cima"), P(0, 1, 1, "Desce controlado"));
        return out;
      }
      case "S": case "B": {
        const out = [P(0, 0, .7, o.key === "B" ? "Barra travada" : "Em pé"), P(0, 1, o.desc || 1.3, o.desc ? `Desce em ${o.desc}s` : "Desce")];
        if (o.pause) out.push(P(1, 1, o.pause, `Pausa ${o.pause}s`));
        else if (o.compPause) out.push(P(1, 1, 1, "Pausa (comando)"));
        else if (o.tng) out.push(P(1, 1, .08, "Toca e sobe"));
        out.push(P(1, 0, o.up || 1.1, o.key === "B" ? (o.up ? `Empurra em ${o.up}s` : "Empurra") : (o.up ? `Sobe em ${o.up}s` : "Sobe")));
        return out;
      }
      case "STIFF": return o.deep ? [P(0, 1, 1.4, "Desce alongando"), P(1, 1, 1.5, "Segura e respira"), P(1, 0, 1.2, "Sobe")] : acc("Desce com a coluna neutra", "Sobe contraindo glúteo", { t1: 1.3, t2: 1 });
      case "ROW": return [P(0, 0, .5, "Posição"), P(0, 1, .6, "Puxa ao peito"), P(1, 1, .2, "Toca"), P(1, 0, .7, "Volta ao chão")];
      case "INCLINE": return [P(1, 1, .3, ""), P(1, 0, .9, "Empurra"), P(0, 0, .3, ""), P(0, 1, 1.3, "Desce controlado")];
      case "PECDECK": return acc("Fecha", "Abre devagar");
      case "LATRAISE": return acc("Sobe até o ombro", "Desce devagar");
      case "FRONTRAISE": return acc("Sobe à frente", "Desce devagar");
      case "CURL": return acc("Sobe", "Desce controlado");
      case "FRENCH": return acc("Estende", "Desce atrás da cabeça", { t2: 1.3 });
      case "PUSHDOWN": return acc("Empurra", "Volta devagar");
      case "PULLDOWN": return acc("Puxa ao peito", "Volta controlado");
      case "SEATROW": return acc("Puxa ao abdômen", "Volta controlado");
      case "LEGPRESS": return [P(0, 0, .3, ""), P(0, 1, 1.3, "Desce"), P(1, 0, 1, "Empurra")];
      case "LEGEXT": return acc("Estende", "Desce devagar");
      case "LEGCURL": return acc("Flexiona", "Volta devagar");
      case "HIPTHRUST": return acc("Sobe o quadril", "Desce", { hold1: .6 });
      case "ABD": return acc(o.add ? "Fecha" : "Abre", o.add ? "Abre devagar" : "Fecha devagar");
      case "PLANK": return [P(0, 1, 1.6, "Segura firme"), P(1, 0, 1.6, "Respira")];
      case "DEADBUG": case "BIRDDOG": return alt("Braço e perna opostos", "Troca o lado");
      case "POSTLEG": return alt("Sobe a perna esticada", "Outra perna");
      case "ANKLE": return [P(0, 1, 1, "Joelho à frente"), P(1, 1, 1, "Segura"), P(1, 0, .8, "Volta")];
      case "SHOULDER": return [P(0, 1, 1.6, "Passa por cima"), P(1, 0, 1.6, "Volta à frente")];
    }
    return [];
  }

  function draw(ctx, img, o, p, plateCol) {
    const ex = EX[o.key], K = Canvas(ex.cam || 0);
    scene(img, ex.scene);
    ex.draw(K, p, Object.assign({ plate: plateCol }, o));
    compose(img, K.layers);
    ctx.putImageData(img, 0, 0);
  }

  let raf = 0;
  function mount(canvas, ex, plateKg, onPhase) {
    cancelAnimationFrame(raf);
    const o = specFor(ex);
    if (!o || !canvas) return null;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d"), img = ctx.createImageData(W, H);
    const col = PLATE[plateKg] || "p20", total = o.phases.reduce((t, x) => t + x.dur, 0);
    const at = sec => {
      let t = sec % total, i = 0;
      while (t > o.phases[i].dur && i < o.phases.length - 1) { t -= o.phases[i].dur; i++; }
      const ph = o.phases[i]; return [lerp(ph.from, ph.to, ease(Math.min(1, t / ph.dur))), i];
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const k = o.phases.findIndex(x => x.from !== x.to); const ph = o.phases[Math.max(0, k)];
      draw(ctx, img, o, ph.to, col); onPhase && onPhase(Math.max(0, k)); return o;
    }
    const t0 = performance.now(); let lastF = -1, lastI = -1;
    const loop = now => {
      if (!canvas.isConnected) return;
      const f = Math.floor((now - t0) / 1000 * FPS);
      if (f !== lastF) { lastF = f; const [p, i] = at(f / FPS); draw(ctx, img, o, p, col); if (i !== lastI) { lastI = i; onPhase && onPhase(i); } }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return o;
  }

  root.PixelMoves = { specFor, mount, draw, EX, W, H };
})(typeof window !== "undefined" ? window : globalThis);
