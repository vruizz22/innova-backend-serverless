-- DropForeignKey
ALTER TABLE "Classroom" DROP CONSTRAINT "Classroom_schoolId_fkey";

-- AlterTable
ALTER TABLE "Classroom" ADD COLUMN     "description" TEXT,
ALTER COLUMN "schoolId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TeacherClassroom" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherClassroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomInvite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassroomInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherClassroom_teacherId_idx" ON "TeacherClassroom"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherClassroom_teacherId_classroomId_key" ON "TeacherClassroom"("teacherId", "classroomId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassroomInvite_code_key" ON "ClassroomInvite"("code");

-- CreateIndex
CREATE INDEX "ClassroomInvite_code_idx" ON "ClassroomInvite"("code");

-- CreateIndex
CREATE INDEX "ClassroomInvite_classroomId_idx" ON "ClassroomInvite"("classroomId");

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherClassroom" ADD CONSTRAINT "TeacherClassroom_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherClassroom" ADD CONSTRAINT "TeacherClassroom_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomInvite" ADD CONSTRAINT "ClassroomInvite_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
