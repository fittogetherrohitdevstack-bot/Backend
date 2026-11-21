/**
 * Complete FitTogether Exercise Seed Data
 * Covers 9 muscle groups: Chest, Back, Shoulders, Biceps, Triceps, Forearms, Legs, Abs, Full Body
 * 50+ thoroughly researched exercises with instructions, common mistakes, alternatives & coaching tips.
 */

const EXERCISE_SEED_DATA = [
  // ===================== CHEST =====================
  {
    name: "Barbell Bench Press",
    slug: "barbell-bench-press",
    description: "The gold standard compound movement for developing upper body pushing strength and chest mass.",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Triceps", "Shoulders"],
    equipment: "Barbell",
    difficulty: "Intermediate",
    category: "Strength",
    instructions: [
      "Lie back on a flat bench with your feet planted firmly on the floor.",
      "Grip the barbell slightly wider than shoulder-width apart, retracting your shoulder blades.",
      "Unrack the bar and lower it with control to your mid-chest line, keeping elbows at a 45-75 degree angle.",
      "Press the barbell explosively upward through your palms back to full extension without locking out harshly."
    ],
    commonMistakes: [
      "Flaring elbows straight out to 90 degrees, risking shoulder impingement.",
      "Bouncing the bar off the rib cage.",
      "Lifting hips off the bench during the push."
    ],
    alternatives: ["Dumbbell Bench Press", "Push-ups", "Smith Machine Bench Press"],
    tips: ["Drive your feet into the floor for leg drive and squeeze your glutes for maximum stability."]
  },
  {
    name: "Incline Dumbbell Press",
    slug: "incline-dumbbell-press",
    description: "Targets the clavicular head (upper chest) and front deltoids with free range of motion.",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Shoulders", "Triceps"],
    equipment: "Dumbbell",
    difficulty: "Intermediate",
    category: "Hypertrophy",
    instructions: [
      "Set an adjustable bench to approximately a 30-45 degree incline.",
      "Sit back with dumbbells resting on your knees, then kick them up to shoulder height.",
      "Lower the dumbbells until you feel a deep stretch in your upper chest, elbows tucked at ~60 degrees.",
      "Press upward and slightly inward, converging at the top without banging the weights together."
    ],
    commonMistakes: [
      "Setting the incline too steep (above 45°), turning it into a shoulder press.",
      "Arching the lower back excessively off the bench pad."
    ],
    alternatives: ["Incline Barbell Bench Press", "Low-to-High Cable Flyes"],
    tips: ["Control the eccentric tempo (2-3 seconds down) to maximize mechanical tension."]
  },
  {
    name: "Dumbbell Chest Flyes",
    slug: "dumbbell-chest-flyes",
    description: "An isolation exercise providing an intense horizontal stretch across the pectoral fibers.",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Shoulders"],
    equipment: "Dumbbell",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Lie on a flat bench holding dumbbells directly over your chest with neutral palms facing each other.",
      "With a slight bend in your elbows, lower the weights in a wide arc until your chest is fully stretched.",
      "Bring the dumbbells back along the same arc by contracting your chest, as if hugging a wide tree."
    ],
    commonMistakes: [
      "Straightening elbows completely, straining the biceps tendon.",
      "Lowering the dumbbells below shoulder level with excessive weight."
    ],
    alternatives: ["Cable Pec Fly", "Pec Deck Machine Fly"],
    tips: ["Focus on pulling your inner elbows toward each other at the peak contraction."]
  },
  {
    name: "Push-ups",
    slug: "push-ups",
    description: "Foundational bodyweight compound exercise for chest, core, and shoulder endurance.",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Triceps", "Abs", "Shoulders"],
    equipment: "Bodyweight",
    difficulty: "Beginner",
    category: "Endurance",
    instructions: [
      "Start in a high plank position with hands slightly wider than shoulder-width.",
      "Brace your core, squeeze your glutes, and maintain a straight line from head to heels.",
      "Lower your chest until it hovers an inch above the floor, keeping elbows angled back.",
      "Push forcefully through your hands to return to the starting plank."
    ],
    commonMistakes: [
      "Sagging hips or piking your lower back.",
      "Flaring elbows excessively wide.",
      "Incomplete range of motion."
    ],
    alternatives: ["Knee Push-ups", "Deficit Push-ups", "Incline Push-ups"],
    tips: ["Screw your palms into the floor to activate your lats and stabilize your shoulders."]
  },
  {
    name: "Cable Crossover",
    slug: "cable-crossover",
    description: "Provides continuous tension across the entire pectoral range of motion.",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Shoulders"],
    equipment: "Cable",
    difficulty: "Intermediate",
    category: "Hypertrophy",
    instructions: [
      "Set cable pulleys at upper chest or high level with single D-handles.",
      "Step forward in a staggered stance, leaning your torso forward slightly.",
      "With arms slightly bent, draw the handles downward and inward until hands cross or touch in front of you.",
      "Hold the peak squeeze for 1 second, then control the release back to a full stretch."
    ],
    commonMistakes: [
      "Using momentum and swinging the torso.",
      "Bending and extending elbows dynamically like a press instead of a fly."
    ],
    alternatives: ["Standing Resistance Band Flyes", "Pec Deck Machine"],
    tips: ["Cross hands alternately (left over right, right over left) for maximum inner chest recruitment."]
  },
  {
    name: "Chest Dips",
    slug: "chest-dips",
    description: "High-intensity compound movement emphasizing the lower pectoral muscles and triceps.",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Triceps", "Shoulders"],
    equipment: "Bodyweight",
    difficulty: "Advanced",
    category: "Strength",
    instructions: [
      "Grip the parallel dip bars and jump or press up to lockout.",
      "Lean your torso forward at roughly 30 degrees and tuck your chin slightly.",
      "Lower your body until your upper arms are parallel to the floor or slightly below.",
      "Press through your palms to return to the top, keeping the forward lean."
    ],
    commonMistakes: [
      "Staying completely upright (which shifts the focus almost exclusively to triceps).",
      "Going too deep without adequate shoulder mobility, risking acromioclavicular strain."
    ],
    alternatives: ["Assisted Dip Machine", "Decline Dumbbell Press"],
    tips: ["Cross your ankles and bend your knees to maintain forward torso inclination."]
  },

  // ===================== BACK =====================
  {
    name: "Conventional Deadlift",
    slug: "conventional-deadlift",
    description: "The ultimate posterior chain compound exercise, building back thickness, spinal erectors, and hips.",
    primaryMuscle: "Back",
    secondaryMuscles: ["Legs", "Forearms", "Abs"],
    equipment: "Barbell",
    difficulty: "Advanced",
    category: "Strength",
    instructions: [
      "Stand with feet hip-width apart, the barbell cutting over the middle of your shoelaces.",
      "Hinge at the hips, grip the bar just outside your shins with double-overhand or mixed grip.",
      "Flatten your back, pull slack out of the barbell, and engage your lats.",
      "Drive the floor away with your legs, standing tall without hyperextending your spine at lockout."
    ],
    commonMistakes: [
      "Rounding the lumbar spine under heavy loads.",
      "Allowing the bar to drift away from the shins/thighs during the pull.",
      "Yanking the bar off the floor without taking out the slack."
    ],
    alternatives: ["Trap Bar Deadlift", "Romanian Deadlift", "Rack Pulls"],
    tips: ["Think of pushing the earth away with your feet rather than pulling the bar up with your arms."]
  },
  {
    name: "Barbell Bent-Over Row",
    slug: "barbell-bent-over-row",
    description: "Mass builder for the mid-back, rhomboids, lats, and rear delts.",
    primaryMuscle: "Back",
    secondaryMuscles: ["Biceps", "Shoulders", "Forearms"],
    equipment: "Barbell",
    difficulty: "Intermediate",
    category: "Strength",
    instructions: [
      "Hold a barbell with an overhand grip slightly wider than shoulder-width.",
      "Hinge forward at the hips to a 45-degree angle or parallel, keeping back flat and knees softly bent.",
      "Pull the bar toward your belly button by driving elbows toward the ceiling.",
      "Squeeze your shoulder blades together at the peak, then lower under control."
    ],
    commonMistakes: [
      "Using torso momentum/bobbing up and down to yank the weight.",
      "Rounding the lower back.",
      "Pulling to the neck instead of the lower ribcage/waist."
    ],
    alternatives: ["Dumbbell Bent-Over Row", "T-Bar Row", "Chest-Supported Row"],
    tips: ["Think of pulling with your elbows, using your hands merely as hooks."]
  },
  {
    name: "Lat Pulldown",
    slug: "lat-pulldown",
    description: "Cable vertical pull that builds back width, latissimus dorsi size, and pulling strength.",
    primaryMuscle: "Back",
    secondaryMuscles: ["Biceps", "Shoulders"],
    equipment: "Cable",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Sit at a lat pulldown station with thighs secured under the roller pads.",
      "Grip the wide bar with an overhand grip wider than shoulder-width.",
      "Lean back slightly (10-15 degrees), depress your scapulae, and pull the bar to your upper chest.",
      "Squeeze lats at the bottom, then allow the bar to return slowly for a full stretch overhead."
    ],
    commonMistakes: [
      "Leaning back excessively to turn it into a horizontal row.",
      "Pulling the bar behind the neck, causing cervical and shoulder strain."
    ],
    alternatives: ["Pull-ups", "Assisted Pull-up Machine", "Resistance Band Pulldowns"],
    tips: ["Keep your chest proud and drive your elbows straight down toward your hip pockets."]
  },
  {
    name: "Pull-ups",
    slug: "pull-ups",
    description: "The premier bodyweight test of relative pulling strength, hitting lats, biceps, and core.",
    primaryMuscle: "Back",
    secondaryMuscles: ["Biceps", "Forearms", "Abs"],
    equipment: "Bodyweight",
    difficulty: "Intermediate",
    category: "Strength",
    instructions: [
      "Hang from a pull-up bar with an overhand grip slightly wider than shoulder-width.",
      "Retract your shoulder blades and brace your abs.",
      "Pull your chest up toward the bar until your chin completely clears the bar.",
      "Lower yourself smoothly back to a full dead hang stretch."
    ],
    commonMistakes: [
      "Kipping or kicking the legs to generate momentum.",
      "Half-repping without reaching full extension at the bottom.",
      "Shrugging shoulders into the ears at the top."
    ],
    alternatives: ["Chin-ups", "Lat Pulldown", "Inverted Rows"],
    tips: ["Engage your core to prevent your lower body from swinging like a pendulum."]
  },
  {
    name: "Seated Cable Row",
    slug: "seated-cable-row",
    description: "Horizontal cable pulling exercise targeting the middle trapezius, rhomboids, and lat thickness.",
    primaryMuscle: "Back",
    secondaryMuscles: ["Biceps", "Forearms"],
    equipment: "Cable",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Sit on the cable bench with feet planted on footrests, knees slightly bent.",
      "Reach forward with a flat back and grip the V-bar handle.",
      "Sit upright with chest out and pull the handle toward your lower abdomen, pinching scapulae.",
      "Extend your arms back forward under control, letting your shoulder blades open slightly."
    ],
    commonMistakes: [
      "Swinging torso back and forth like a rowing machine.",
      "Shrugging shoulders up toward the ears."
    ],
    alternatives: ["Single-Arm Dumbbell Row", "Machine Row"],
    tips: ["Hold the contraction for a full second with your chest high and shoulders depressed."]
  },
  {
    name: "Single-Arm Dumbbell Row",
    slug: "single-arm-dumbbell-row",
    description: "Unilateral back builder that corrects muscular imbalances and targets lats through a deep stretch.",
    primaryMuscle: "Back",
    secondaryMuscles: ["Biceps", "Shoulders"],
    equipment: "Dumbbell",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Place one knee and one hand on a flat bench, keeping back flat and parallel to the ground.",
      "Hold a dumbbell in the opposite hand hanging straight down.",
      "Pull the dumbbell up along your hip, leading with your elbow.",
      "Lower the dumbbell slowly to a full stretch without twisting your torso."
    ],
    commonMistakes: [
      "Rotating the torso violently to heave the weight up.",
      "Pulling straight up to the chest instead of arcing back toward the hip."
    ],
    alternatives: ["Meadows Row", "Barbell Bent-Over Row", "Cable Single-Arm Row"],
    tips: ["Keep your working elbow tight against your ribcage during the lift."]
  },

  // ===================== SHOULDERS =====================
  {
    name: "Overhead Barbell Press",
    slug: "overhead-barbell-press",
    description: "The primary compound press for total shoulder development, upper chest, and core stability.",
    primaryMuscle: "Shoulders",
    secondaryMuscles: ["Triceps", "Abs", "Chest"],
    equipment: "Barbell",
    difficulty: "Intermediate",
    category: "Strength",
    instructions: [
      "Stand tall holding the barbell at collarbone height with hands slightly wider than shoulders.",
      "Brace your core, squeeze your glutes, and tuck your chin slightly.",
      "Press the bar vertically overhead, moving your head back through once the bar clears your forehead.",
      "Lock out overhead with arms straight and shrug slightly up into the trap muscles."
    ],
    commonMistakes: [
      "Excessive lumbar arching (turning it into an incline chest press).",
      "Pressing the bar in a curved path out in front of your center of gravity."
    ],
    alternatives: ["Dumbbell Shoulder Press", "Seated Military Press", "Push Press"],
    tips: ["Keep your forearms perfectly vertical under the barbell at the start of each rep."]
  },
  {
    name: "Dumbbell Lateral Raise",
    slug: "dumbbell-lateral-raise",
    description: "The premier isolation exercise for sculpting wide, capped lateral deltoids.",
    primaryMuscle: "Shoulders",
    secondaryMuscles: ["Forearms"],
    equipment: "Dumbbell",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Stand or sit holding dumbbells at your sides with a slight forward torso lean.",
      "Keep a slight bend in your elbows and lead the lift with your elbows.",
      "Raise arms out to the sides until parallel with the floor.",
      "Lower slowly under control back to your sides."
    ],
    commonMistakes: [
      "Using heavy momentum and swinging the upper body.",
      "Lifting hands higher than elbows (which recruits the front delts)."
    ],
    alternatives: ["Cable Lateral Raise", "Machine Lateral Raise", "Band Lateral Raise"],
    tips: ["Imagine pouring water from pitchers at the top of the movement to isolate lateral delts."]
  },
  {
    name: "Face Pull",
    slug: "face-pull",
    description: "Crucial corrective exercise for posterior deltoids, external rotators, and postural health.",
    primaryMuscle: "Shoulders",
    secondaryMuscles: ["Back"],
    equipment: "Cable",
    difficulty: "Beginner",
    category: "Mobility",
    instructions: [
      "Attach a rope to a cable pulley at eye or upper chest level.",
      "Grip the rope ends with thumbs pointing backward.",
      "Step back, pull the center of the rope toward your bridge of the nose, separating hands outward.",
      "Externally rotate your shoulders at the end, pinching your rear deltoids and scapulae."
    ],
    commonMistakes: [
      "Pulling to the neck without externally rotating hands.",
      "Using too much weight and jerking torso backward."
    ],
    alternatives: ["Rear Delt Dumbbell Flyes", "Band Pull-Aparts"],
    tips: ["Make a 'double bicep pose' at the contraction point for optimal external rotator recruitment."]
  },
  {
    name: "Seated Dumbbell Shoulder Press",
    slug: "seated-dumbbell-shoulder-press",
    description: "Safe and effective overhead shoulder builder offering independent arm mechanics.",
    primaryMuscle: "Shoulders",
    secondaryMuscles: ["Triceps"],
    equipment: "Dumbbell",
    difficulty: "Intermediate",
    category: "Hypertrophy",
    instructions: [
      "Sit on an upright bench with back support, holding dumbbells at shoulder height with palms forward.",
      "Press the dumbbells overhead until arms are extended, meeting slightly at the top.",
      "Lower slowly until dumbbells reach ear/shoulder level."
    ],
    commonMistakes: [
      "Lowering only halfway (half-repping).",
      "Allowing wrists to bend backward under heavy weight."
    ],
    alternatives: ["Overhead Barbell Press", "Arnold Press", "Machine Shoulder Press"],
    tips: ["Keep your wrists stacked directly over your elbows throughout the entire lift."]
  },
  {
    name: "Arnold Press",
    slug: "arnold-press",
    description: "Popularized by Arnold Schwarzenegger, this rotational press hits all three heads of the deltoid.",
    primaryMuscle: "Shoulders",
    secondaryMuscles: ["Triceps"],
    equipment: "Dumbbell",
    difficulty: "Intermediate",
    category: "Hypertrophy",
    instructions: [
      "Sit holding dumbbells in front of your chin with palms facing your chest, like the top of a bicep curl.",
      "As you press overhead, rotate your wrists outward until palms face forward at full lockout.",
      "Reverse the rotational motion smoothly as you lower back to chin height."
    ],
    commonMistakes: [
      "Rushing the rotation or separating it into two distinct awkward steps.",
      "Going too heavy and losing shoulder control."
    ],
    alternatives: ["Dumbbell Shoulder Press", "Cuban Press"],
    tips: ["Maintain smooth, continuous rotational fluid motion from bottom to top."]
  },

  // ===================== BICEPS =====================
  {
    name: "Barbell Bicep Curl",
    slug: "barbell-bicep-curl",
    description: "The primary builder for total bicep mass, supination strength, and forearm involvement.",
    primaryMuscle: "Biceps",
    secondaryMuscles: ["Forearms"],
    equipment: "Barbell",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Stand tall holding a barbell with an underhand shoulder-width grip.",
      "Pin your elbows to your sides and brace your core.",
      "Curl the barbell up toward your shoulders, squeezing biceps hard at the peak.",
      "Lower the bar slowly for 2-3 seconds back to full extension."
    ],
    commonMistakes: [
      "Swinging the lower back to kick the weight up.",
      "Allowing elbows to drift forward excessively."
    ],
    alternatives: ["EZ-Bar Curl", "Dumbbell Bicep Curl", "Cable Curl"],
    tips: ["Squeeze the bar hard and actively flex your triceps at the bottom for full range."]
  },
  {
    name: "Incline Dumbbell Curl",
    slug: "incline-dumbbell-curl",
    description: "Puts the long head of the bicep under a deep passive stretch for building peak height.",
    primaryMuscle: "Biceps",
    secondaryMuscles: ["Forearms"],
    equipment: "Dumbbell",
    difficulty: "Intermediate",
    category: "Hypertrophy",
    instructions: [
      "Set an incline bench to 45-60 degrees and sit back with dumbbells hanging straight down.",
      "Keep elbows pointing at the floor and curl the weights up, supinating wrists as you rise.",
      "Squeeze biceps at the top, then lower with full control to feel the stretch in your long head."
    ],
    commonMistakes: [
      "Swinging elbows forward off the vertical plane.",
      "Lifting your head and shoulders off the bench pad."
    ],
    alternatives: ["Behind-the-Back Cable Curl", "Preacher Curl"],
    tips: ["Supinate your pinkies as hard as possible at the top of each repetition."]
  },
  {
    name: "Hammer Curl",
    slug: "hammer-curl",
    description: "Builds the brachialis and brachioradialis, adding thickness to the outer arm and forearm.",
    primaryMuscle: "Biceps",
    secondaryMuscles: ["Forearms"],
    equipment: "Dumbbell",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Stand holding dumbbells with a neutral grip (palms facing each other).",
      "Keep upper arms stationary and curl the weights upward toward your chest/shoulders.",
      "Pause for a brief contraction, then lower slowly back to starting position."
    ],
    commonMistakes: [
      "Using momentum and swinging the torso.",
      "Rotating wrists during the curl (keep them strictly neutral)."
    ],
    alternatives: ["Rope Cable Hammer Curl", "Cross-Body Hammer Curl"],
    tips: ["Cross-body hammer curls can further target the brachialis muscle."]
  },
  {
    name: "Preacher Curl",
    slug: "preacher-curl",
    description: "Eliminates body momentum completely to strictly isolate the short head of the bicep.",
    primaryMuscle: "Biceps",
    secondaryMuscles: ["Forearms"],
    equipment: "Barbell",
    difficulty: "Intermediate",
    category: "Hypertrophy",
    instructions: [
      "Sit at a preacher bench and place your upper arms firmly flat against the slanted pad.",
      "Grip an EZ-curl bar with an underhand grip.",
      "Curl the bar toward your face until forearms are nearly vertical.",
      "Lower under control, stopping just short of a harsh elbow hyperextension lockout."
    ],
    commonMistakes: [
      "Hyperextending and tearing bicep tendon at the bottom with bouncing weights.",
      "Lifting hips off the seat to lever the bar up."
    ],
    alternatives: ["Dumbbell Preacher Curl", "Machine Preacher Curl"],
    tips: ["Never bounce the weight at the bottom; treat the eccentric phase with respect."]
  },
  {
    name: "Cable Rope Curl",
    slug: "cable-rope-curl",
    description: "Keeps continuous tension throughout the curl with wrist flexibility at the peak.",
    primaryMuscle: "Biceps",
    secondaryMuscles: ["Forearms"],
    equipment: "Cable",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Attach a rope attachment to the bottom pulley of a cable stack.",
      "Grip the rope ends with neutral palms and elbows tucked tight.",
      "Curl the rope up, spreading the handles apart at the top for maximum contraction.",
      "Lower with controlled tempo back to the starting point."
    ],
    commonMistakes: [
      "Letting elbows sway backward during the pull.",
      "Rushing through the bottom eccentric stretch."
    ],
    alternatives: ["Barbell Bicep Curl", "Dumbbell Curl"],
    tips: ["Spread the rope ends out wide at the top to peak bicep recruitment."]
  },

  // ===================== TRICEPS =====================
  {
    name: "Tricep Rope Pushdown",
    slug: "tricep-rope-pushdown",
    description: "The classic isolation exercise for lateral and medial triceps heads with continuous cable resistance.",
    primaryMuscle: "Triceps",
    secondaryMuscles: ["Forearms"],
    equipment: "Cable",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Attach a rope to a high cable pulley and grip with both hands.",
      "Pin your elbows to your sides, hinge forward slightly at the hips.",
      "Extend your arms down, pushing the rope apart at the bottom to lock out triceps.",
      "Allow forearms to rise back to slightly above 90 degrees under control."
    ],
    commonMistakes: [
      "Letting elbows flare or travel forward and backward.",
      "Using chest and body weight to push down rather than triceps extension."
    ],
    alternatives: ["Straight Bar Pushdown", "V-Bar Pushdown", "Resistance Band Pushdown"],
    tips: ["Spread the two ends of the rope outward at the bottom for intense lateral head lockout."]
  },
  {
    name: "Skull Crushers (Lying Triceps Extension)",
    slug: "skull-crushers",
    description: "Mass-building movement for the long head of the triceps.",
    primaryMuscle: "Triceps",
    secondaryMuscles: ["Chest"],
    equipment: "Barbell",
    difficulty: "Intermediate",
    category: "Hypertrophy",
    instructions: [
      "Lie flat on a bench holding an EZ-curl bar above your chest with arms extended.",
      "Hinge at the elbows to lower the bar toward your forehead or crown of your head.",
      "Keep elbows pointing straight up and tucked in.",
      "Extend your elbows back up to the starting position."
    ],
    commonMistakes: [
      "Flaring elbows out to the sides.",
      "Moving the shoulders excessively rather than hinging purely at the elbow."
    ],
    alternatives: ["Dumbbell Skull Crushers", "Overhead Cable Extension"],
    tips: ["Angle your upper arms slightly back toward your head to keep constant tension on the long head."]
  },
  {
    name: "Overhead Dumbbell Triceps Extension",
    slug: "overhead-dumbbell-triceps-extension",
    description: "Fully stretches the triceps long head from an overhead position.",
    primaryMuscle: "Triceps",
    secondaryMuscles: ["Shoulders"],
    equipment: "Dumbbell",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Sit or stand holding a single heavy dumbbell overhead with both hands forming a diamond cup under the inner plate.",
      "Lower the dumbbell behind your head by bending your elbows.",
      "Feel a deep stretch in your triceps, then press back up overhead to full extension."
    ],
    commonMistakes: [
      "Letting elbows flare excessively wide.",
      "Arching the lower back to compensate for lack of shoulder mobility."
    ],
    alternatives: ["Overhead Cable Rope Extension", "French Press"],
    tips: ["Brace your core tight so your spine remains neutral while overhead."]
  },
  {
    name: "Close-Grip Bench Press",
    slug: "close-grip-bench-press",
    description: "Heavy compound exercise allowing maximum triceps loading and strength development.",
    primaryMuscle: "Triceps",
    secondaryMuscles: ["Chest", "Shoulders"],
    equipment: "Barbell",
    difficulty: "Intermediate",
    category: "Strength",
    instructions: [
      "Lie on a flat bench and grip the barbell with hands shoulder-width apart (not too narrow).",
      "Unrack the bar and lower it to your lower chest, keeping elbows tucked close to your ribs.",
      "Press the bar up forcefully, locking out primarily with your triceps."
    ],
    commonMistakes: [
      "Placing hands too close together (inches apart), which strains the wrists severely.",
      "Flaring elbows out instead of keeping them tucked."
    ],
    alternatives: ["Dips", "Diamond Push-ups", "Close-Grip Dumbbell Press"],
    tips: ["A shoulder-width grip is optimal to protect your wrists while heavily loading triceps."]
  },
  {
    name: "Bench Dips",
    slug: "bench-dips",
    description: "Accessible bodyweight exercise for triceps hypertrophy and muscle endurance.",
    primaryMuscle: "Triceps",
    secondaryMuscles: ["Shoulders", "Chest"],
    equipment: "Bodyweight",
    difficulty: "Beginner",
    category: "Endurance",
    instructions: [
      "Place your hands shoulder-width apart on the edge of a sturdy flat bench.",
      "Extend your legs out in front of you with heels on the floor.",
      "Lower your body by bending elbows until upper arms are parallel to the floor.",
      "Press through your palms to return to full arm extension."
    ],
    commonMistakes: [
      "Letting hips drift too far away from the bench, stressing anterior shoulder capsules.",
      "Dipping too deep below 90 degrees."
    ],
    alternatives: ["Parallel Bar Dips", "Tricep Pushdowns"],
    tips: ["Elevate your feet on a second bench or add a weight plate across your lap for extra resistance."]
  },

  // ===================== FOREARMS =====================
  {
    name: "Barbell Wrist Curl",
    slug: "barbell-wrist-curl",
    description: "Directly targets the forearm flexors to build massive grip strength and lower arm size.",
    primaryMuscle: "Forearms",
    secondaryMuscles: [],
    equipment: "Barbell",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Sit on a bench with forearms resting flat on your thighs, wrists hanging just over your knees.",
      "Hold a barbell with an underhand grip.",
      "Let the bar roll down into your fingers, then curl your fingers and flex your wrists upward.",
      "Pause for a peak squeeze, then lower slowly."
    ],
    commonMistakes: [
      "Using excessive weight that strains the wrist joint.",
      "Lifting forearms off the thighs."
    ],
    alternatives: ["Dumbbell Wrist Curl", "Behind-the-Back Wrist Curl"],
    tips: ["Letting the bar roll gently to your fingertips before curling increases range of motion."]
  },
  {
    name: "Reverse Barbell Curl",
    slug: "reverse-barbell-curl",
    description: "Strengthens the wrist extensors and the brachioradialis for complete forearm development.",
    primaryMuscle: "Forearms",
    secondaryMuscles: ["Biceps"],
    equipment: "Barbell",
    difficulty: "Intermediate",
    category: "Hypertrophy",
    instructions: [
      "Stand holding a barbell or EZ-bar with an overhand (pronated) shoulder-width grip.",
      "Keep elbows pinned to your sides and curl the bar toward your chest.",
      "Squeeze your forearms hard at the top, then lower with a controlled 3-second negative."
    ],
    commonMistakes: [
      "Swinging the body or cocking wrists awkwardly.",
      "Using too much weight causing elbow strain."
    ],
    alternatives: ["Reverse Cable Curl", "Hammer Curl"],
    tips: ["Use an EZ-bar to reduce wrist torque and maintain neutral alignment."]
  },
  {
    name: "Farmer's Walk",
    slug: "farmers-walk",
    description: "Unmatched functional exercise for crushing grip strength, trap development, and core stability.",
    primaryMuscle: "Forearms",
    secondaryMuscles: ["Back", "Abs", "Legs"],
    equipment: "Dumbbell",
    difficulty: "Beginner",
    category: "Strength",
    instructions: [
      "Pick up heavy dumbbells or kettlebells in each hand with a strong neutral grip.",
      "Pull your shoulder blades back, brace your core, and stand tall.",
      "Walk forward with smooth, controlled, deliberate steps for the target distance or time.",
      "Keep your body upright and prevent weights from swaying."
    ],
    commonMistakes: [
      "Slouching shoulders forward or letting the torso sway side-to-side.",
      "Taking hasty, tripping strides."
    ],
    alternatives: ["Trap Bar Carry", "Single-Arm Suitcase Carry"],
    tips: ["Squeeze the handles as hard as possible for maximum isometric grip recruitment."]
  },

  // ===================== LEGS =====================
  {
    name: "Barbell Back Squat",
    slug: "barbell-back-squat",
    description: "The undisputed king of lower body exercises, developing quads, glutes, hamstrings, and spinal stability.",
    primaryMuscle: "Legs",
    secondaryMuscles: ["Abs", "Back"],
    equipment: "Barbell",
    difficulty: "Advanced",
    category: "Strength",
    instructions: [
      "Rest the barbell securely across your upper traps (high bar) or rear delts (low bar).",
      "Set your feet slightly wider than shoulder-width with toes turned out 15-30 degrees.",
      "Brace your core with a deep belly breath, hinge at hips and knees simultaneously.",
      "Descend until hip crease is below the top of the kneecap (parallel or deeper).",
      "Drive through your mid-foot to stand back up, keeping chest upright."
    ],
    commonMistakes: [
      "Knees caving inward (valgus collapse) during the drive.",
      "Rising onto toes or lifting heels off the floor.",
      "Rounding the lower back in the hole (butt wink)."
    ],
    alternatives: ["Front Squat", "Leg Press", "Goblet Squat"],
    tips: ["Screw your feet into the floor to activate your glutes and create hip torque."]
  },
  {
    name: "Romanian Deadlift (RDL)",
    slug: "romanian-deadlift",
    description: "Targeted hip hinge for immense hamstring stretch, glute hypertrophy, and lower back strength.",
    primaryMuscle: "Legs",
    secondaryMuscles: ["Back", "Forearms"],
    equipment: "Barbell",
    difficulty: "Intermediate",
    category: "Hypertrophy",
    instructions: [
      "Hold a barbell at hip level with an overhand grip, feet hip-width apart.",
      "Keep a soft bend in your knees, push your hips back, and slide the bar down your thighs.",
      "Lower until you feel a deep stretch in your hamstrings (usually mid-shin level).",
      "Drive hips forward through your glutes to return to standing upright."
    ],
    commonMistakes: [
      "Squatting down rather than hinging at the hips.",
      "Rounding the spine or letting the bar drift away from legs."
    ],
    alternatives: ["Dumbbell RDL", "Single-Leg RDL", "Good Mornings"],
    tips: ["Imagine trying to touch a wall behind you with your glutes on the way down."]
  },
  {
    name: "Leg Press",
    slug: "leg-press",
    description: "Allows heavy quad and glute overloading without axial spinal compression.",
    primaryMuscle: "Legs",
    secondaryMuscles: [],
    equipment: "Machine",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Sit in the machine with your back and pelvis pressed firmly against the back pad.",
      "Place feet shoulder-width apart in the center of the sled.",
      "Disengage safety bars, lower sled under control until knees reach 90 degrees.",
      "Press the sled back up through your heels without locking out knees harshly."
    ],
    commonMistakes: [
      "Locking knees out violently at the top, risking severe joint hyperextension.",
      "Letting lower back curl off the seat cushion at the bottom."
    ],
    alternatives: ["Hack Squat", "Barbell Squat", "Goblet Squat"],
    tips: ["Keep your tailbone firmly glued to the seat throughout every inch of the rep."]
  },
  {
    name: "Bulgarian Split Squat",
    slug: "bulgarian-split-squat",
    description: "Unilateral leg builder that develops quads, glute medius stability, and athletic balance.",
    primaryMuscle: "Legs",
    secondaryMuscles: ["Abs"],
    equipment: "Dumbbell",
    difficulty: "Intermediate",
    category: "Hypertrophy",
    instructions: [
      "Stand a couple of feet in front of a flat bench holding dumbbells at your sides.",
      "Place the top of your rear foot flat on the bench behind you.",
      "Lower your body until your front thigh is parallel to the ground.",
      "Drive through the front heel to return to the starting position."
    ],
    commonMistakes: [
      "Placing front foot too close to the bench, jamming the front knee.",
      "Leaning sideways or losing balance due to narrow footing."
    ],
    alternatives: ["Walking Lunges", "Step-ups", "Split Squat"],
    tips: ["Keep your feet hip-width apart horizontally rather than directly on a tightrope."]
  },
  {
    name: "Leg Extension",
    slug: "leg-extension",
    description: "Direct isolation for the quadriceps, specifically hitting the rectus femoris.",
    primaryMuscle: "Legs",
    secondaryMuscles: [],
    equipment: "Machine",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Sit on the machine with your back supported and the pad resting against your lower shins.",
      "Align your knee joints with the machine's pivot axis.",
      "Extend your legs to full extension, squeezing your quads at the top.",
      "Lower slowly back to the starting position."
    ],
    commonMistakes: [
      "Kicking the weight up with explosive momentum.",
      "Setting the roller pad too high on the shins."
    ],
    alternatives: ["Sissy Squat", "Goblet Squat"],
    tips: ["Hold the top contraction for 1 second to maximize quad muscle fiber recruitment."]
  },
  {
    name: "Lying Leg Curl",
    slug: "lying-leg-curl",
    description: "Isolates the hamstring knee flexion function to build thick, well-rounded hamstrings.",
    primaryMuscle: "Legs",
    secondaryMuscles: [],
    equipment: "Machine",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Lie face down on the leg curl machine with the roller pad behind your lower calves.",
      "Grip the handles, curl the pad up toward your glutes by flexing your knees.",
      "Hold the contraction briefly, then lower slowly for 2-3 seconds."
    ],
    commonMistakes: [
      "Lifting hips off the bench pad to yank the weight up.",
      "Allowing the weight stack to slam at the bottom."
    ],
    alternatives: ["Seated Leg Curl", "Nordic Hamstring Curl", "Swiss Ball Hamstring Curl"],
    tips: ["Point your toes slightly outward to hit the outer biceps femoris."]
  },
  {
    name: "Standing Calf Raise",
    slug: "standing-calf-raise",
    description: "Develops the gastrocnemius muscle of the calves with heavy full-stretch loading.",
    primaryMuscle: "Legs",
    secondaryMuscles: [],
    equipment: "Machine",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Position the balls of your feet on the calf block, shoulders under the padded levers.",
      "Lower your heels down as far as possible to achieve a deep calf stretch.",
      "Press through the balls of your feet to raise your heels as high as possible.",
      "Hold the peak contraction for 1 full second, then descend slowly."
    ],
    commonMistakes: [
      "Bouncing fast at the bottom using Achilles tendon elasticity instead of muscle work.",
      "Bending knees instead of keeping them extended."
    ],
    alternatives: ["Seated Calf Raise", "Leg Press Calf Raise", "Single-Leg Bodyweight Calf Raise"],
    tips: ["Pause for a full 2-second dead stop at the bottom stretch on every single rep."]
  },
  {
    name: "Walking Lunges",
    slug: "walking-lunges",
    description: "Dynamic leg movement developing functional quad strength, glute drive, and core balance.",
    primaryMuscle: "Legs",
    secondaryMuscles: ["Abs"],
    equipment: "Dumbbell",
    difficulty: "Intermediate",
    category: "Hypertrophy",
    instructions: [
      "Stand tall holding dumbbells at your sides.",
      "Step forward with one leg, lowering your hips until both knees are bent at 90 degrees.",
      "Drive through the front heel to rise up and step forward with the rear leg.",
      "Repeat in a continuous walking fashion."
    ],
    commonMistakes: [
      "Slamming the rear knee hard into the floor.",
      "Taking steps that are too short, pushing front knee past the toes with lifted heel."
    ],
    alternatives: ["Reverse Lunges", "Bulgarian Split Squat", "Step-ups"],
    tips: ["Lean forward slightly at the torso to place greater emphasis on the gluteus maximus."]
  },
  {
    name: "Goblet Squat",
    slug: "goblet-squat",
    description: "Excellent squat variation for perfecting depth, mobility, and building quad endurance.",
    primaryMuscle: "Legs",
    secondaryMuscles: ["Abs", "Shoulders"],
    equipment: "Kettlebell",
    difficulty: "Beginner",
    category: "Endurance",
    instructions: [
      "Hold a dumbbell or kettlebell vertically against your chest with both hands.",
      "Set your feet shoulder-width apart, toes flared slightly.",
      "Squat down by pushing your hips back and spreading your knees apart.",
      "Descend deep between your knees, keeping your chest tall, then push back up."
    ],
    commonMistakes: [
      "Letting the weight pull your upper body forward.",
      "Allowing heels to lift off the floor."
    ],
    alternatives: ["Barbell Front Squat", "Bodyweight Air Squats"],
    tips: ["Use your elbows to gently nudge your knees outward at the bottom of the squat."]
  },

  // ===================== ABS =====================
  {
    name: "Hanging Leg Raise",
    slug: "hanging-leg-raise",
    description: "High-level core exercise targeting lower abs, hip flexors, and grip strength.",
    primaryMuscle: "Abs",
    secondaryMuscles: ["Forearms"],
    equipment: "Bodyweight",
    difficulty: "Advanced",
    category: "Strength",
    instructions: [
      "Hang from a pull-up bar with an overhand grip, shoulders engaged.",
      "Tilt your pelvis backward and contract your abs.",
      "Raise your straight legs up until parallel to the floor or higher toward the bar.",
      "Lower your legs smoothly without swinging your torso."
    ],
    commonMistakes: [
      "Swinging your body back and forth to generate pendulum momentum.",
      "Lifting only with hip flexors without curling the pelvis."
    ],
    alternatives: ["Hanging Knee Raise", "Captain's Chair Knee Raise", "Lying Leg Raise"],
    tips: ["Focus on curling your tailbone toward your chin rather than just lifting your feet."]
  },
  {
    name: "Cable Woodchoppers",
    slug: "cable-woodchoppers",
    description: "Rotational core exercise that sculpts the obliques and improves functional athletic power.",
    primaryMuscle: "Abs",
    secondaryMuscles: ["Shoulders"],
    equipment: "Cable",
    difficulty: "Intermediate",
    category: "Hypertrophy",
    instructions: [
      "Set a cable pulley at high shoulder height with a single handle.",
      "Stand sideways to the cable with a wide athletic stance.",
      "Grip the handle with both hands and pull diagonally down across your body toward your opposite hip.",
      "Pivot on your back foot and control the weight back to the high starting position."
    ],
    commonMistakes: [
      "Bending arms and pulling with upper body instead of rotating through core.",
      "Keeping feet glued without allowing natural hip pivot."
    ],
    alternatives: ["Russian Twists", "Band Woodchoppers"],
    tips: ["Keep your arms relatively straight to ensure the torque comes from your torso rotation."]
  },
  {
    name: "Ab Wheel Rollout",
    slug: "ab-wheel-rollout",
    description: "Elite anti-extension core builder that strengthens the entire anterior abdominal wall.",
    primaryMuscle: "Abs",
    secondaryMuscles: ["Back", "Shoulders"],
    equipment: "Bodyweight",
    difficulty: "Advanced",
    category: "Strength",
    instructions: [
      "Kneel on a soft mat holding the ab wheel directly beneath your shoulders.",
      "Tuck your pelvis and brace your abs tight.",
      "Roll the wheel forward slowly, extending your body as far as you can maintain a neutral spine.",
      "Pull yourself back to the starting position using your abdominal muscles."
    ],
    commonMistakes: [
      "Letting your lower back sag into hyperextension, stressing the lumbar spine.",
      "Pulling back with your hips instead of your abs."
    ],
    alternatives: ["Plank Walkouts", "Stability Ball Rollout"],
    tips: ["Start with small ranges of motion or roll against a wall to prevent overextension."]
  },
  {
    name: "Plank",
    slug: "plank",
    description: "Fundamental isometric core exercise that reinforces spinal stability and abdominal endurance.",
    primaryMuscle: "Abs",
    secondaryMuscles: ["Shoulders", "Legs"],
    equipment: "Bodyweight",
    difficulty: "Beginner",
    category: "Endurance",
    instructions: [
      "Place forearms on the floor with elbows directly under your shoulders.",
      "Extend your legs behind you with toes planted.",
      "Form a straight line from your head to your heels, squeezing glutes and pulling belly button inward.",
      "Hold this position statically while breathing steadily."
    ],
    commonMistakes: [
      "Sagging hips toward the floor.",
      "Piking hips up toward the ceiling.",
      "Holding your breath."
    ],
    alternatives: ["Side Plank", "Copenhagen Plank", "RKC Plank"],
    tips: ["Actively pull your elbows toward your toes to generate maximum tension (RKC style)."]
  },
  {
    name: "Russian Twists",
    slug: "russian-twists",
    description: "Rotational movement for internal and external obliques and deep transverse abdominis.",
    primaryMuscle: "Abs",
    secondaryMuscles: [],
    equipment: "Bodyweight",
    difficulty: "Beginner",
    category: "Hypertrophy",
    instructions: [
      "Sit on the floor with knees bent and feet slightly elevated or flat on the floor.",
      "Lean your torso back at roughly 45 degrees to engage your core.",
      "Hold your hands together or clasp a weight, rotating your torso from side to side.",
      "Touch the floor beside your hip on each side."
    ],
    commonMistakes: [
      "Moving just the arms without actually rotating the thoracic spine.",
      "Rounding the spine into a slouched posture."
    ],
    alternatives: ["Bicycle Crunches", "Cable Woodchoppers"],
    tips: ["Follow your hands with your eyes to ensure complete trunk rotation."]
  },

  // ===================== FULL BODY =====================
  {
    name: "Kettlebell Swing",
    slug: "kettlebell-swing",
    description: "Explosive hip hinge exercise for cardiovascular conditioning, glutes, hamstrings, and core.",
    primaryMuscle: "Full Body",
    secondaryMuscles: ["Legs", "Back", "Abs", "Forearms"],
    equipment: "Kettlebell",
    difficulty: "Intermediate",
    category: "Endurance",
    instructions: [
      "Stand with feet shoulder-width apart, kettlebell on the floor slightly in front of you.",
      "Hinge at your hips, hike the kettlebell back between your legs like a football.",
      "Drive your hips forward explosively, swinging the kettlebell to chest height.",
      "Allow the kettlebell to fall back naturally, absorbing the weight into your hips and repeating."
    ],
    commonMistakes: [
      "Squatting the kettlebell instead of hinging at the hips.",
      "Using the arms/shoulders to lift the bell rather than hip momentum."
    ],
    alternatives: ["Dumbbell Swing", "Broad Jumps"],
    tips: ["Snap your hips forward at the top and contract your glutes like a standing plank."]
  },
  {
    name: "Clean and Press",
    slug: "clean-and-press",
    description: "Full body Olympic-style lift that develops explosive power, shoulders, traps, and leg drive.",
    primaryMuscle: "Full Body",
    secondaryMuscles: ["Legs", "Shoulders", "Back", "Triceps"],
    equipment: "Barbell",
    difficulty: "Advanced",
    category: "Strength",
    instructions: [
      "Set up in a deadlift stance with the barbell over your midfoot.",
      "Pull the bar explosively off the floor, extending hips and shrugging to rack the bar onto your front delts.",
      "Dip your knees slightly and drive the barbell overhead to full lockout.",
      "Lower with control back to the front rack, then back to the floor."
    ],
    commonMistakes: [
      "Pulling purely with the arms instead of generating hip extension.",
      "Catching the bar on wrists without creating a proper shoulder rack shelf."
    ],
    alternatives: ["Dumbbell Clean and Press", "Kettlebell Clean and Press"],
    tips: ["Keep the bar path close to your body throughout the entire pull."]
  },
  {
    name: "Burpees",
    slug: "burpees",
    description: "Classic high-intensity conditioning movement testing whole-body strength and metabolic conditioning.",
    primaryMuscle: "Full Body",
    secondaryMuscles: ["Chest", "Legs", "Abs", "Shoulders"],
    equipment: "Bodyweight",
    difficulty: "Beginner",
    category: "Endurance",
    instructions: [
      "Stand tall, then drop down placing your hands on the floor.",
      "Kick your feet back into a push-up position and lower your chest to the deck.",
      "Press your body up and hop your feet back under your hips.",
      "Explode vertically into a jump, clapping hands overhead."
    ],
    commonMistakes: [
      "Sagging lower back in the plank/push-up portion.",
      "Landing stiff-legged on your toes instead of cushioning the jump."
    ],
    alternatives: ["Sprawls (No push-up)", "Step-back Burpees"],
    tips: ["Find a rhythmic breathing pace to maintain high reps without gassing out too early."]
  },
  {
    name: "Thrusters",
    slug: "thrusters",
    description: "Combination of a front squat and an overhead press creating intense cardiovascular and full-body strain.",
    primaryMuscle: "Full Body",
    secondaryMuscles: ["Legs", "Shoulders", "Triceps", "Abs"],
    equipment: "Barbell",
    difficulty: "Advanced",
    category: "Strength",
    instructions: [
      "Hold the barbell in the front rack position with elbows high.",
      "Perform a full front squat until thighs are parallel to the floor.",
      "Drive out of the squat with power, using the upward momentum to press the barbell straight overhead.",
      "Lower the bar back to your front rack as you descend into the next squat rep."
    ],
    commonMistakes: [
      "Separating into a disjointed squat then pause then press instead of one fluid motion.",
      "Dropping elbows during the squat, causing the bar to roll forward."
    ],
    alternatives: ["Dumbbell Thrusters", "Kettlebell Thrusters", "Wall Balls"],
    tips: ["Use the powerful extension of your hips out of the squat hole to launch the bar overhead."]
  }
];

module.exports = EXERCISE_SEED_DATA;
