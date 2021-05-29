// Note that there is no global objects like Game or Memory.
//All methods, prototypes and constants are imported built-in modules
// import {
//   ATTACK,
//   CostMatrix,
//   HEAL,
//   RANGED_ATTACK,
//   RoomPosition,
//   getDirection,
//   getRange,
//   getObjectById,
//   getObjectsByPrototype,
//   getTime
// } from "game";

// Everything can be imported either from the root /game module or corresponding submodules
// import { pathFinder } from "game";
// pathFinder.searchPath();
// import { prototypes } from "game";
// prototypes.Creep
// prototypes.RoomObject

// import {searchPath } from '/game/path-finder';
// import {Creep} from '/game/prototypes';

// This would work too:
// import * as PathFinder from '/game/path-finder'; --> PathFinder.searchPath
// import {Creep} from '/game/prototypes/creep';
// import * as prototypes from '/game/prototypes'; --> prototypes.Creep

// This stuff is arena-specific
import { ATTACK, HEAL, RANGED_ATTACK, TOUGH } from "game/constants";
import { BodyPart, Flag } from "arena";
import { Creep, RoomObject, StructureTower } from "game/prototypes";
import { getDirection, getDistance, getObjectsByPrototype, getTime } from "game/utils";
import { searchPath } from "game/path-finder";
import { Game } from "../../test/unit/mock";

declare module "game/prototypes" {
  interface Creep {
    initialPos: RoomPosition;
  }
}

// You can also import your files like this:
// import {roleAttacker} from './roles/attacker.mjs';

// We can define global objects that will be valid for the entire match.
// The game guarantees there will be no global reset during the match.
// Note that you cannot assign any game objects here, since they are populated on the first tick, not when the script is initialized.
let myCreeps: Creep[];
let enemyCreeps: Creep[];
let enemyFlag: Flag;
let myFlag: Flag;
let myTower: StructureTower;
let isEnemyOutOfRangedUnits: boolean = false;
let corner: number; //the corner of avail able square eg 9 or 81 for (9,9) or (81,81)
let rally: { x: number; y: number };

// This is the only exported function from the main module. It is called every tick.
export function loop(): void {
  // We assign global variables here. They will be accessible throughout the tick, and even on the following ticks too.
  // getObjectsByPrototype function is the alternative to Room.find from Screeps World.
  // There is no Game.creeps or Game.structures, you can manage game objects in your own way.
  myCreeps = getObjectsByPrototype(Creep).filter(i => i.my);
  enemyCreeps = getObjectsByPrototype(Creep).filter(i => !i.my);
  enemyFlag = getObjectsByPrototype(Flag).find(i => !i.my)!;
  myFlag = getObjectsByPrototype(Flag).find(i => i.my)!;
  myTower = getObjectsByPrototype(StructureTower).find(i => i.my)!;
  isEnemyOutOfRangedUnits = enemyCreeps.filter(e => e.body.some(i => i.type === RANGED_ATTACK)).length <= 0;

  if (myTower) {
    let clo: Creep | undefined = myTower.findClosestByRange(enemyCreeps);
    let mine: Creep | undefined = myTower.findClosestByRange(myCreeps);

    //let isHalfEnergy = myTower.store.energy > myTower.store.getCapacity() / 2;
    if (clo /*&&isHalfEnergy*/) {
      myTower.attack(clo);
    }
    //doesnt work because towers dont have .pos????????
    // else if (clo && getDistance(clo.pos,myTower.pos) <= 10) {
    //   console.log(`kamahamahaaaaa!!!!`);
    //   myTower.attack(clo);
    // }
    else if (mine && isEnemyOutOfRangedUnits) {
      console.log(`heal: ${mine.id}`);
      myTower.heal(mine);
    }
  }
  // Notice how getTime is a global function, but not Game.time anymore
  if (getTime() % 10 === 0) {
    // let north = myCreeps.filter(c => c.squad === "north");
    // let northheal = north.filter(c => c.body.some(i => i.type === HEAL));
    // let south = myCreeps.filter(c => c.squad === "south");
    // let southheal = south.filter(c => c.body.some(i => i.type === HEAL));
    // console.log(
    //   `status: ${myCreeps.length} creeps. North h:${northheal.length}/${north.length} South h:${southheal.length}/${south.length}`
    // );
  }

  let firsthealer = myCreeps.filter(creep => creep.body.some(i => i.type === HEAL))[0];
  // Run all my creeps according to their bodies
  myCreeps.forEach(creep => {
    //initial setup
    // Here is the alternative to the creep "memory" from Screeps World.
    //All game objects are persistent. You can assign any property to it once,
    //and it will be available during the entire match.
    if (!creep.initialPos) {
      creep.initialPos = { x: creep.x, y: creep.y };
      //top of map
      if (myTower!.x == 4) {
        creep.squad = creep.x == myTower!.x + 4 ? "north" : "south";
        corner = 8;
        rally = { x: 56, y: 72 };
      }
      //bottom of map
      else {
        creep.squad = creep.x == myTower!.x - 4 ? "north" : "south";
        corner = 91;
        rally = { x: 33, y: 26 };
      }
      if (creep.id === firsthealer.id) creep.isBaseHealer = true;
      else creep.isBaseHealer = false;
    }
    //end initial setup

    if (creep.body.some(i => i.type === ATTACK)) {
      meleeAttacker(creep);
    }
    if (creep.body.some(i => i.type === RANGED_ATTACK)) {
      rangedAttacker(creep);
    }
    if (creep.body.some(i => i.type === HEAL)) {
      if (creep.isBaseHealer) baseHealer(creep);
      else healer(creep);
    }
  });
}

function meleeAttacker(creep: Creep) {
  //hunt range 100 duiring the "ranged unit wait" time or when enemy is out of guys
  let huntDistance = !isEnemyOutOfRangedUnits ? 10 : 100;
  const targets = enemyCreeps
    .filter(i => getDistance(i, creep.initialPos) < huntDistance)
    .sort((a, b) => getDistance(a, creep) - getDistance(b, creep));

  let hasDefLeft = creep.body.filter(i => i.type === TOUGH&&i.hits>0).length>1;
  if (hasDefLeft) {
    if (targets.length > 0) {
      creep.moveTo(targets[0]);
      creep.attack(targets[0]);
    } else if (isEnemyOutOfRangedUnits && targets.length <= 0) {
      creep.moveTo(enemyFlag);
    }
  } else {
    //move to base healer (to get healed)
    creep.moveTo(myCreeps.filter(c => c.isBaseHealer)[0]);
  }
}

function rangedAttacker(creep: Creep) {
  const targets = enemyCreeps
    .filter(i => i.body.some(i => i.type === RANGED_ATTACK || i.type === ATTACK || i.type === HEAL))
    .sort((a, b) => getDistance(a, creep) - getDistance(b, creep));

  if (targets.length == 1) {
    creep.rangedAttack(targets[0]);
  } else creep.rangedMassAttack();

    if (creep.hits >= creep.hitsMax) creep.moveTo(enemyFlag);
    else {
      //if hurt move to my base healer
      creep.moveTo(myCreeps.filter(c => c.isBaseHealer)[0]);
      return;
  }

  const range = 3;
  //const isHealerInRange = myCreeps.filter(c=>c.body.some(i => i.type === HEAL)&&getDistance(c,creep)<2).length>0;
  const enemiesInRange = enemyCreeps.filter(i => getDistance(i, creep) < range);
  if (enemiesInRange.length > 0) {
    flee(creep, enemiesInRange, range);
  }
}

//stays at home to heal units
function baseHealer(creep: Creep) {
  const healTargets = myCreeps
    .filter(i => getDistance(i, creep) <= 3 && i.hits < i.hitsMax)
    .sort((a, b) => a.hits - b.hits);

  if (healTargets.length > 0) {
    if (getDistance(healTargets[0], creep) === 1) {
      creep.heal(healTargets[0]);
    } else {
      creep.rangedHeal(healTargets[0]);
    }
  }
  if (myFlag) creep.moveTo(myFlag);
}

function healer(creep: Creep) {
  //console.log(`h:${creep.id}`)

  const targets = myCreeps.filter(i => i !== creep && i.hits < i.hitsMax).sort((a, b) => a.hits - b.hits);

  if (targets.length) {
    creep.moveTo(targets[0]);
  } else {
    creep.moveTo(enemyFlag);
  }

  const healTargets = myCreeps.filter(i => getRange(i, creep) <= 3).sort((a, b) => a.hits - b.hits);

  if (healTargets.length > 0) {
    if (getRange(healTargets[0], creep) === 1) {
      creep.heal(healTargets[0]);
    } else {
      creep.rangedHeal(healTargets[0]);
    }
  }

  const range = 4;
  const enemiesInRange = enemyCreeps.filter(i => getDistance(i, creep) < range);
  if (enemiesInRange.length > 0) {
    flee(creep, enemiesInRange, range);
  }
}

function flee(creep: Creep, targets: RoomObject[], range: number) {
  const result = searchPath(
    creep,
    targets.map(i => ({ pos: i, range })),
    { flee: true }
  );
  if (result.path.length > 0) {
    const direction = getDirection(result.path[0].x - creep.x, result.path[0].y - creep.y);
    creep.move(direction);
  }
}
