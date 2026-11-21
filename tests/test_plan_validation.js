const connectToDb = require("../Config/db");
const WorkoutPlan = require("../Modals/WorkoutPlan");
const WORKOUT_TEMPLATES = require("../seed/workoutTemplatesData");
const mongoose = require("mongoose");

async function testValidation() {
  await connectToDb();
  const dummyUserId = new mongoose.Types.ObjectId();

  // Test 1: Apply ALL Templates
  console.log(`Testing all ${WORKOUT_TEMPLATES.length} templates...`);
  for (const template of WORKOUT_TEMPLATES) {
    try {
      const doc = new WorkoutPlan({
        userId: dummyUserId,
        name: template.name,
        description: template.description,
        fitnessLevel: template.fitnessLevel,
        goal: template.goal,
        daysPerWeek: template.daysPerWeek,
        isTemplate: false,
        templateKey: template.templateKey,
        schedule: template.schedule,
        isActive: true,
      });
      await doc.validate();
      console.log(`✓ Template "${template.name}" passed validation`);
    } catch (err) {
      console.error(`✗ Template "${template.name}" FAILED:`, err.message);
      process.exit(1);
    }
  }

  // Test 2: Custom Plan Builder payload
  console.log("Testing custom plan payload...");
  try {
    const doc2 = new WorkoutPlan({
      userId: dummyUserId,
      name: "My Custom Plan",
      description: "Test description",
      fitnessLevel: "Intermediate",
      goal: "Hypertrophy",
      daysPerWeek: 4,
      schedule: [
        {
          dayOfWeek: 1,
          dayName: "Chest Day",
          isRestDay: false,
          targetMuscles: ["Chest"],
          exercises: [
            {
              name: "Bench Press",
              targetSets: 3,
              targetReps: 10,
              restSeconds: 60,
              primaryMuscle: "Chest",
            },
          ],
        },
      ],
      isActive: true,
    });
    await doc2.validate();
    console.log("Custom plan validation passed!");
  } catch (err) {
    console.error("Custom plan validation FAILED:", err.message);
  }

  process.exit(0);
}

testValidation();
