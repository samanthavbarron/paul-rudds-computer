import { validateCharacter, type Character, type Clip, type Part, type Track, type Vector3Tuple } from './scene.ts';

const ZERO: Vector3Tuple = [0, 0, 0];
const ONE: Vector3Tuple = [1, 1, 1];

function motion(part: string, property: Track['property'], axis: Track['axis'], values: number[]): Track {
  return { part, property, axis, keyframes: values.map((value, index) => ({ time: index / (values.length - 1), value })) };
}

function dance(kind: 'celery' | 'oyster' | 'tayne'): Clip {
  const energetic = kind === 'oyster';
  return {
    name: kind === 'celery' ? '4D3D3D3' : kind === 'oyster' ? 'OYSTER BOUNCE' : 'HAT WOBBLE',
    duration: energetic ? 1.35 : 2.4,
    tracks: [
      motion('hips', 'position', 'y', [0, -.09, 0, -.09, 0]),
      motion('hips', 'position', 'x', [-.10, 0, .10, 0, -.10]),
      motion('hips', 'rotation', 'y', [-.12, 0, .12, 0, -.12]),
      motion('torso', 'rotation', 'z', [-.07, 0, .07, 0, -.07]),
      motion('torso', 'rotation', 'x', energetic ? [.10, .38, .10, .38, .10] : [0, -.035, 0, -.035, 0]),
      motion('head', 'rotation', 'z', [.08, -.04, -.08, .04, .08]),
      motion('head', 'rotation', 'y', [-.14, 0, .14, 0, -.14]),
      motion('leftArm', 'rotation', 'z', energetic ? [-.3, -.7, -.3, -.7, -.3] : [-.55, -.8, -.5, -.45, -.55]),
      motion('rightArm', 'rotation', 'z', energetic ? [.7, .3, .7, .3, .7] : [.45, .5, .8, .55, .45]),
      motion('leftForearm', 'rotation', 'x', [-1.2, -.7, -1, -.7, -1.2]),
      motion('rightForearm', 'rotation', 'x', [-.7, -1, -.7, -1.2, -.7]),
      motion('leftHand', 'rotation', 'z', [-.2, .2, -.2, .2, -.2]),
      motion('rightHand', 'rotation', 'z', [.2, -.2, .2, -.2, .2]),
      motion('leftLeg', 'rotation', 'x', [.06, -.19, .06, .10, .06]),
      motion('rightLeg', 'rotation', 'x', [.06, .10, .06, -.19, .06]),
      motion('leftShin', 'rotation', 'x', [.03, .22, .03, .13, .03]),
      motion('rightShin', 'rotation', 'x', [.03, .13, .03, .22, .03]),
      ...(kind === 'tayne' ? [motion('hat', 'rotation', 'z', [0, -.15, .15, -.1, 0])] : []),
    ],
  };
}

function makeHuman(kind: 'celery' | 'oyster' | 'tayne'): Character {
  const parts: Part[] = [];
  const skin = kind === 'oyster' ? '#d89a72' : '#dbac8f';
  const shadowSkin = kind === 'oyster' ? '#be7e58' : '#c39277';
  const shirt = kind === 'celery' ? '#eeeeea' : kind === 'oyster' ? '#191c20' : '#bd8842';
  const jacket = kind === 'celery' ? '#4c5157' : '#bd2c2b';
  const pants = kind === 'celery' ? '#353a42' : '#24282b';
  function add(id: string, parent: string, shape: Part['shape'], position: Vector3Tuple, scale: Vector3Tuple = ONE, color = skin, rotation: Vector3Tuple = ZERO) {
    parts.push({ id, parent, shape, position: [...position], scale: [...scale], color, rotation: [...rotation] });
  }
  add('hips', 'root', 'group', [0, 1.35, 0]);
  add('pelvis', 'hips', 'box', [0, 0, 0], [.58, .31, .35], pants);
  add('belt', 'hips', 'box', [0, .17, 0], [.59, .075, .365], '#292623');
  add('buckle', 'hips', 'box', [0, .17, .19], [.105, .073, .026], '#a89c7c');
  add('torso', 'hips', 'group', [0, .11, 0]);
  add('waist', 'torso', 'box', [0, .23, 0], [.56, .40, .34], shirt);
  add('chest', 'torso', 'box', [0, .59, 0], [.73, .43, .37], shirt);
  add('neck', 'torso', 'cylinder', [0, .98, 0], [.21, .24, .23]);
  add('collarLeft', 'torso', 'box', [-.115, .83, .19], [.17, .17, .04], kind === 'celery' ? '#f6f5ee' : shirt, [0, 0, .38]);
  add('collarRight', 'torso', 'box', [.115, .83, .19], [.17, .17, .04], kind === 'celery' ? '#f6f5ee' : shirt, [0, 0, -.38]);
  if (kind !== 'tayne') {
    add('jacketLeft', 'torso', 'box', [-.25, .47, -.025], [.25, .81, .42], jacket, [0, 0, -.035]);
    add('jacketRight', 'torso', 'box', [.25, .47, -.025], [.25, .81, .42], jacket, [0, 0, .035]);
    add('jacketBack', 'torso', 'box', [0, .45, -.18], [.72, .79, .10], jacket);
    add('lapelLeft', 'torso', 'box', [-.16, .67, .219], [.105, .38, .035], kind === 'celery' ? '#686c70' : '#d84437', [0, 0, -.25]);
    add('lapelRight', 'torso', 'box', [.16, .67, .219], [.105, .38, .035], kind === 'celery' ? '#686c70' : '#d84437', [0, 0, .25]);
  }
  if (kind === 'celery') {
    add('tieKnot', 'torso', 'box', [0, .795, .218], [.086, .095, .05], '#373b40', [0, 0, Math.PI / 4]);
    add('tie', 'torso', 'box', [0, .56, .218], [.095, .40, .04], '#3c4046');
    add('tieTip', 'torso', 'cone', [0, .33, .218], [.095, .08, .04], '#3c4046', [0, 0, Math.PI]);
    add('pocket', 'torso', 'box', [.25, .68, .215], [.14, .024, .025], '#32363c');
  }
  if (kind === 'tayne') {
    add('shirtSeam', 'torso', 'box', [0, .52, .193], [.027, .64, .018], '#e1b26d');
    for (let i = 0; i < 4; i++) add(`button${i}`, 'torso', 'sphere', [0, .3 + i * .15, .211], [.032, .032, .018], '#dcccb1');
    for (let i = 0; i < 12; i++) {
      add(`shirtPattern${i}`, 'torso', 'box', [((i % 4) - 1.5) * .16, .27 + Math.floor(i / 4) * .2, .20], [.075, .105, .02], i % 2 ? '#594027' : '#e1b26d', [0, 0, i % 2 ? -.4 : .4]);
    }
  }
  add('head', 'torso', 'group', [0, 1.02, .015]);
  add('skull', 'head', 'sphere', [0, .33, 0], [.49, .63, .44]);
  add('jaw', 'head', 'box', [0, .15, .04], [.35, .19, .31]);
  add('chin', 'head', 'sphere', [0, .10, .14], [.25, .10, .14]);
  add('nose', 'head', 'cone', [0, .31, .266], [.09, .14, .11], skin, [Math.PI / 2, 0, 0]);
  add('noseBridge', 'head', 'box', [0, .37, .211], [.072, .12, .077]);
  add('mouth', 'head', 'box', [0, .204, .213], [.16, .022, .025], '#8c554d');
  add('smile', 'head', 'box', [0, .212, .227], [.125, .017, .011], '#eee1cf');
  for (const [side, sign] of [['left', -1], ['right', 1]] as const) {
    add(`${side}Ear`, 'head', 'sphere', [sign * .245, .32, -.013], [.085, .15, .11], shadowSkin);
    add(`${side}Eye`, 'head', 'sphere', [sign * .108, .403, .192], [.104, .058, .055], '#e7e4d9');
    add(`${side}Pupil`, 'head', 'sphere', [sign * .107, .403, .22], [.038, .042, .021], '#323231');
    add(`${side}Brow`, 'head', 'box', [sign * .111, .463, .186], [.124, .032, .047], '#302a25', [0, 0, sign * -.08]);
    add(`${side}Cheek`, 'head', 'sphere', [sign * .139, .274, .145], [.13, .11, .135], skin);
    add(`${side}Arm`, 'torso', 'group', [sign * .405, .77, 0], ONE, skin, [0, 0, sign * .12]);
    const sleeve = kind === 'celery' ? jacket : kind === 'oyster' ? jacket : shirt;
    add(`${side}Sleeve`, `${side}Arm`, 'capsule', [0, -.205, 0], [.24, .46, .265], sleeve);
    add(`${side}Forearm`, `${side}Arm`, 'group', [0, -.43, 0], ONE, skin, [-.14, 0, 0]);
    add(`${side}ForearmMesh`, `${side}Forearm`, 'capsule', [0, -.185, 0], [.19, .39, .215], kind === 'celery' ? jacket : skin);
    add(`${side}Cuff`, `${side}Forearm`, 'cylinder', [0, -.355, 0], [.205, .067, .225], kind === 'celery' ? '#e7e5dd' : '#302c28');
    add(`${side}Hand`, `${side}Forearm`, 'group', [0, -.46, 0]);
    add(`${side}Palm`, `${side}Hand`, 'box', [0, 0, 0], [.16, .17, .10]);
    for (let finger = 0; finger < 4; finger++) {
      add(`${side}Finger${finger}`, `${side}Hand`, 'capsule', [(finger - 1.5) * .041, -.127, .006], [.037, .115 - Math.abs(finger - 1.5) * .014, .041], skin, [0, 0, (finger - 1.5) * .06]);
    }
    add(`${side}Thumb`, `${side}Hand`, 'capsule', [-sign * .105, -.03, .01], [.055, .12, .055], skin, [0, 0, -sign * .65]);
    add(`${side}Leg`, 'hips', 'group', [sign * .18, -.08, 0], ONE, skin, [0, 0, sign * .055]);
    add(`${side}Thigh`, `${side}Leg`, 'capsule', [0, -.285, 0], [.29, .61, .33], pants);
    add(`${side}TrouserCrease`, `${side}Leg`, 'box', [0, -.29, .157], [.014, .47, .016], kind === 'celery' ? '#53565b' : pants);
    add(`${side}Shin`, `${side}Leg`, 'group', [0, -.59, 0]);
    add(`${side}Calf`, `${side}Shin`, 'capsule', [0, -.24, 0], [.255, .53, .29], pants);
    add(`${side}Shoe`, `${side}Shin`, 'box', [0, -.55, .083], [.285, .19, .49], '#222427');
    add(`${side}ShoeTop`, `${side}Shin`, 'sphere', [0, -.465, .07], [.28, .16, .41], '#333438');
    add(`${side}Sole`, `${side}Shin`, 'box', [0, -.638, .083], [.29, .035, .50], '#18191b');
  }
  add('hairBack', 'head', 'sphere', [0, .40, -.14], [.455, .38, .20], '#312820');
  if (kind === 'celery') {
    add('hairTop', 'head', 'sphere', [0, .62, -.028], [.49, .22, .42], '#2b2624');
    add('hairSweep', 'head', 'icosahedron', [-.115, .641, .08], [.27, .20, .27], '#39322e', [0, 0, -.2]);
    add('hairLeft', 'head', 'box', [-.22, .44, -.05], [.07, .23, .21], '#2b2624');
    add('hairRight', 'head', 'box', [.22, .44, -.05], [.07, .23, .21], '#2b2624');
  } else if (kind === 'oyster') {
    add('hat', 'head', 'group', [0, .55, 0]);
    add('cap', 'hat', 'sphere', [0, .055, -.015], [.51, .27, .47], '#ce332a');
    add('capBrim', 'hat', 'box', [0, -.015, -.28], [.39, .045, .27], '#b92524', [.13, 0, 0]);
    add('capBand', 'hat', 'box', [0, -.025, .209], [.18, .075, .023], '#882623');
    add('necklace', 'torso', 'torus', [0, .885, .02], [.25, .25, .22], '#b4ac97', [Math.PI / 2, 0, 0]);
  } else {
    add('hat', 'head', 'group', [0, .62, -.025]);
    add('hatBrim', 'hat', 'cylinder', [0, .005, 0], [.85, .048, .64], '#292928');
    add('hatCrown', 'hat', 'cylinder', [0, .14, 0], [.46, .27, .38], '#343330');
    add('hatCrease', 'hat', 'box', [0, .272, 0], [.095, .013, .27], '#20201f');
    add('hatBand', 'hat', 'cylinder', [0, .053, 0], [.47, .057, .39], '#565044');
    add('glassesLeft', 'head', 'box', [-.118, .406, .228], [.19, .11, .053], '#151617', [0, -.11, 0]);
    add('glassesRight', 'head', 'box', [.118, .406, .228], [.19, .11, .053], '#151617', [0, .11, 0]);
    add('glassesBridge', 'head', 'box', [0, .423, .252], [.07, .026, .02], '#292929');
  }
  const basic = dance(kind);
  const kick: Clip = {
    name: 'HIGH KICK', duration: 2,
    tracks: [
      motion('rightLeg', 'rotation', 'x', [0, -.2, -1.45, -.2, 0]),
      motion('rightShin', 'rotation', 'x', [0, .6, .05, .6, 0]),
      motion('leftArm', 'rotation', 'z', [-.2, -.8, -1.2, -.8, -.2]),
      motion('rightArm', 'rotation', 'z', [.2, .8, 1.2, .8, .2]),
      motion('torso', 'rotation', 'x', [0, -.1, -.2, -.1, 0]),
    ],
  };
  const spin: Clip = { name: 'ROTATION', duration: 4, tracks: [motion('root', 'rotation', 'y', [0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2])] };
  return validateCharacter({
    name: kind === 'celery' ? 'CELERY MAN' : kind === 'oyster' ? 'OYSTER' : 'TAYNE',
    description: kind === 'celery' ? 'The original sequence. A cheerfully awkward man in a charcoal suit, white shirt, and skinny dark tie.' : kind === 'oyster' ? 'Red cap backwards. Red jacket. Unreasonable levels of enthusiasm.' : 'A beta sequence in a black fedora, dark glasses, and a gold patterned shirt. His hat has a little wobble.',
    parts, clips: [basic, kick, spin], defaultClip: basic.name,
  });
}

export const PRESETS: Character[] = [makeHuman('celery'), makeHuman('oyster'), makeHuman('tayne')];
