# HOTLINE ABAKAN — recovery build, 2026-10-10

This build is intentionally **not another numbered gameplay version**. It fixes the blockers shown in the 2026-10-10 screen recording before any new mechanics are added.

## Fixed from the recording

- **Invisible enemies while AI/HUD still work.** `Punk.gltf`, `Worker.gltf`, and `Suit.gltf` were loaded once and the same `gltf.scene` object was passed to several Actors. Three.js reparents an Object3D when it gets a new parent, so the visible model was silently moved from the first NPC to the later NPC while the first NPC's AI kept running. Every Actor now receives a skeleton-safe cloned scene and boot asserts that all actor model roots are unique.
- **Blocked route at the apartment exit.** `Stairs_Entrance_Concrete.gltf` was placed across the only center exit and given a full-width collider. The prop is removed from that threshold and the vestibule opening is widened. A runtime route-safety check now aborts loudly if a full collider crosses the critical start lanes.
- **Pipe/plank unreadable in the hand.** `Wrist.R` local +Y points down/back on the supplied rigs; the old melee shaft extended into the body/floor. Held melee weapons now use a grip root and project along a readable hand-local axis. World pickups stay horizontal on the floor.

## GitHub baseline used as product truth

Connected repository: `aka-gst/hotline-abakan`, main commit `c497d7e18c3dee8290287b0d627b478ec169a897` ("import latest Desktop release", 2026-09-20). That baseline already documents/fixes sequential authored-floor progression, 11 campaign floors, procedural night generation, and richer AI. Those systems are treated as the progression/content reference instead of inventing another parallel roadmap in this 3D branch.

## Recovery gate

No new combat feature is allowed before the following is true in a real playthrough: player visible; floor pickup visible; equipped weapon visible; first Punk visible; vestibule Worker visible; center exit physically passable; courtyard reachable.
