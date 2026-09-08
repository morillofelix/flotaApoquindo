-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."DriverSubgroupType" AS ENUM ('CATEGORY', 'THURSDAY_GROUP');

-- CreateTable
CREATE TABLE "public"."AccessUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "tempPasswordSentAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "canSolicitudes" BOOLEAN NOT NULL DEFAULT false,
    "canCalendario" BOOLEAN NOT NULL DEFAULT false,
    "canMotivos" BOOLEAN NOT NULL DEFAULT false,
    "canEjecutivos" BOOLEAN NOT NULL DEFAULT false,
    "canConductores" BOOLEAN NOT NULL DEFAULT false,
    "canPropietarios" BOOLEAN NOT NULL DEFAULT false,
    "canPagoPropietario" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Appointment" (
    "id" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "appointmentDate" DATE NOT NULL,
    "appointmentReason" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedExecutive" TEXT NOT NULL DEFAULT '',
    "vacationEndDate" DATE,
    "vacationStartDate" DATE,
    "permitDate" DATE,
    "permitEndDate" DATE,
    "permitEndTime" TEXT NOT NULL DEFAULT '',
    "permitStartDate" DATE,
    "permitStartTime" TEXT NOT NULL DEFAULT '',
    "permitType" TEXT NOT NULL DEFAULT '',
    "ticketNumber" SERIAL NOT NULL,
    "scheduledEndTime" TEXT NOT NULL DEFAULT '',
    "scheduledStartTime" TEXT NOT NULL DEFAULT '',
    "dateChangeMessage" TEXT NOT NULL DEFAULT '',
    "dateChangePending" BOOLEAN NOT NULL DEFAULT false,
    "createdByExecutiveName" TEXT NOT NULL DEFAULT '',
    "createdByType" TEXT NOT NULL DEFAULT 'conductor',
    "driverApprovalMessage" TEXT NOT NULL DEFAULT '',
    "driverApprovalPending" BOOLEAN NOT NULL DEFAULT false,
    "driverApprovalRejected" BOOLEAN NOT NULL DEFAULT false,
    "swapFromDate" DATE,
    "swapToDate" DATE,
    "rejectionMessage" TEXT NOT NULL DEFAULT '',
    "observation" TEXT NOT NULL DEFAULT '',
    "evidenceImageData" TEXT NOT NULL DEFAULT '',
    "evidenceImageFileName" TEXT NOT NULL DEFAULT '',
    "evidenceImageMimeType" TEXT NOT NULL DEFAULT '',
    "driverCategoryCodeSnapshot" TEXT NOT NULL DEFAULT '',
    "driverCategoryNameSnapshot" TEXT NOT NULL DEFAULT '',
    "driverGroupCodeSnapshot" TEXT NOT NULL DEFAULT '',
    "driverGroupNameSnapshot" TEXT NOT NULL DEFAULT '',
    "driverThursdayGroupCodeSnapshot" TEXT NOT NULL DEFAULT '',
    "driverThursdayGroupNameSnapshot" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AppointmentReason" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "allowsExecutiveAssignment" BOOLEAN NOT NULL DEFAULT false,
    "usesDateRange" BOOLEAN NOT NULL DEFAULT false,
    "usesPermitDetails" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "restrictedWeekdays" TEXT NOT NULL DEFAULT '',
    "businessDaysAdvance" INTEGER NOT NULL DEFAULT 0,
    "requiresBusinessDayAdvance" BOOLEAN NOT NULL DEFAULT false,
    "appointmentDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "usesAppointmentDuration" BOOLEAN NOT NULL DEFAULT false,
    "serviceStartTime" TEXT NOT NULL DEFAULT '',
    "usesServiceStartTime" BOOLEAN NOT NULL DEFAULT false,
    "weekdayBusinessAdvance" TEXT NOT NULL DEFAULT '',
    "visibleToDriver" BOOLEAN NOT NULL DEFAULT true,
    "usesDaySwap" BOOLEAN NOT NULL DEFAULT false,
    "requiresObservation" BOOLEAN NOT NULL DEFAULT false,
    "allowsAttachment" BOOLEAN NOT NULL DEFAULT false,
    "requiresAttachment" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AppointmentReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL DEFAULT '',
    "previousValue" TEXT NOT NULL DEFAULT '',
    "newValue" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "userEmail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BlockReason" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiresManualUnlock" BOOLEAN NOT NULL DEFAULT false,
    "blocksAllServices" BOOLEAN NOT NULL DEFAULT true,
    "blocksLongTripsOnly" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailySchedule" (
    "id" TEXT NOT NULL,
    "monthlyScheduleId" TEXT,
    "date" DATE NOT NULL,
    "driverOwnerId" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "shiftAssignmentId" TEXT,
    "baseStatusId" TEXT,
    "effectiveStatusId" TEXT,
    "appointmentId" TEXT,
    "driverBlockId" TEXT,
    "observation" TEXT NOT NULL DEFAULT '',
    "changeOrigin" TEXT NOT NULL DEFAULT 'generated',
    "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
    "modifiedByEmail" TEXT NOT NULL DEFAULT '',
    "modifiedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cyclePosition" INTEGER,
    "endTime" TEXT NOT NULL DEFAULT '',
    "startTime" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "DailySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyScheduleEvent" (
    "id" TEXT NOT NULL,
    "dailyScheduleId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "eventType" TEXT NOT NULL DEFAULT 'appointment',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "label" TEXT NOT NULL DEFAULT '',
    "metadata" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyScheduleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DriverBlock" (
    "id" TEXT NOT NULL,
    "driverOwnerId" TEXT NOT NULL,
    "blockReasonId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "observation" TEXT NOT NULL DEFAULT '',
    "evidenceFileName" TEXT NOT NULL DEFAULT '',
    "evidenceMimeType" TEXT NOT NULL DEFAULT '',
    "evidenceData" TEXT NOT NULL DEFAULT '',
    "blocksAllServices" BOOLEAN NOT NULL DEFAULT true,
    "blocksLongTripsOnly" BOOLEAN NOT NULL DEFAULT false,
    "requiresManualUnlock" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdByEmail" TEXT NOT NULL DEFAULT '',
    "unlockedAt" TIMESTAMP(3),
    "unlockedByEmail" TEXT NOT NULL DEFAULT '',
    "unlockType" TEXT NOT NULL DEFAULT '',
    "unlockReason" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DriverGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DriverLongTripRestriction" (
    "id" TEXT NOT NULL,
    "driverOwnerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'enabled',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL DEFAULT '',
    "observation" TEXT NOT NULL DEFAULT '',
    "createdByEmail" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverLongTripRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DriverOwner" (
    "id" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "birthDate" DATE,
    "emergencyContactEmail" TEXT NOT NULL DEFAULT '',
    "emergencyContactName" TEXT NOT NULL DEFAULT '',
    "emergencyContactPhone" TEXT NOT NULL DEFAULT '',
    "inspectionExpiryDate" DATE,
    "isConductor" BOOLEAN NOT NULL DEFAULT false,
    "isPropietario" BOOLEAN NOT NULL DEFAULT false,
    "landlinePhone" TEXT NOT NULL DEFAULT '',
    "licenseExpiryDate" DATE,
    "licensePlate" TEXT NOT NULL DEFAULT '',
    "mobilePhone" TEXT NOT NULL DEFAULT '',
    "municipalLicense" TEXT NOT NULL DEFAULT '',
    "recordStatus" TEXT NOT NULL DEFAULT 'V',
    "rut" TEXT NOT NULL DEFAULT '',
    "shifts" TEXT NOT NULL DEFAULT '',
    "subscriptionDate" DATE,
    "vehicleType" TEXT NOT NULL DEFAULT '',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "tempPasswordSentAt" TIMESTAMP(3),
    "groupId" TEXT,
    "observation" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "DriverOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DriverShiftAssignment" (
    "id" TEXT NOT NULL,
    "driverOwnerId" TEXT NOT NULL,
    "shiftDefinitionId" TEXT,
    "patternId" TEXT,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "observation" TEXT NOT NULL DEFAULT '',
    "createdByEmail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DriverSubgroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."DriverSubgroupType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverSubgroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DriverSubgroupAssignment" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "subgroupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverSubgroupAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Executive" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dailyLimitEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyLimitMax" INTEGER,
    "lunchBreakEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lunchBreakEnd" TEXT NOT NULL DEFAULT '',
    "lunchBreakStart" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Executive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'nacional',
    "businessDaysAdvance" INTEGER NOT NULL DEFAULT 15,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "commune" TEXT NOT NULL DEFAULT '',
    "holidayType" TEXT NOT NULL DEFAULT '',
    "isIrrenunciable" BOOLEAN NOT NULL DEFAULT false,
    "region" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MonthlySchedule" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "generatedAt" TIMESTAMP(3),
    "generatedByEmail" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OperationalStatus" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "icon" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "indicatesAvailability" BOOLEAN NOT NULL DEFAULT false,
    "blocksAssignments" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Propietario" (
    "id" TEXT NOT NULL,
    "importKey" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL DEFAULT '',
    "fullName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "secondLastName" TEXT NOT NULL DEFAULT '',
    "rut" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "landlinePhone" TEXT NOT NULL DEFAULT '',
    "mobilePhone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "province" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "bankAccount" TEXT NOT NULL DEFAULT '',
    "accountHolder" TEXT NOT NULL DEFAULT '',
    "bankBic" TEXT NOT NULL DEFAULT '',
    "paymentMethod" TEXT NOT NULL DEFAULT '',
    "paymentDay" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "branchOffice" TEXT NOT NULL DEFAULT '',
    "area" TEXT NOT NULL DEFAULT '',
    "costCenter" TEXT NOT NULL DEFAULT '',
    "isVip" BOOLEAN NOT NULL DEFAULT false,
    "gender" TEXT NOT NULL DEFAULT '',
    "recordStatus" TEXT NOT NULL DEFAULT 'V',
    "licenseExpiryDate" DATE,
    "birthDate" DATE,
    "incorporationDate" DATE,
    "deactivationDate" DATE,
    "emergencyContactName" TEXT NOT NULL DEFAULT '',
    "emergencyContactEmail" TEXT NOT NULL DEFAULT '',
    "emergencyContactPhone" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "titularBankAccount" TEXT NOT NULL DEFAULT '',
    "titularBankName" TEXT NOT NULL DEFAULT '',
    "titularEmail" TEXT NOT NULL DEFAULT '',
    "titularRut" TEXT NOT NULL DEFAULT '',
    "accountingAccount" TEXT NOT NULL DEFAULT '',
    "inactiveReason" TEXT NOT NULL DEFAULT '',
    "activationReason" TEXT NOT NULL DEFAULT '',
    "desvinculacionDays" INTEGER NOT NULL DEFAULT 0,
    "desvinculacionReason" TEXT NOT NULL DEFAULT '',
    "desvinculadoUntil" DATE,
    "status" TEXT NOT NULL DEFAULT 'activo',
    "post" TEXT NOT NULL DEFAULT '',
    "bankGuaranteePdfData" TEXT NOT NULL DEFAULT '',
    "bankGuaranteePdfFileName" TEXT NOT NULL DEFAULT '',
    "isProvisionalBankData" BOOLEAN NOT NULL DEFAULT false,
    "bankAccountType" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Propietario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PropietarioBank" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankBic" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PropietarioBank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ShiftDayRule" (
    "id" TEXT NOT NULL,
    "shiftDefinitionId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "works" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "defaultStatusCode" TEXT NOT NULL DEFAULT 'TRABAJA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftDayRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ShiftDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "groupId" TEXT,
    "categorySubgroupId" TEXT,
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "crossesMidnight" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL DEFAULT '#0b5cab',
    "validFrom" DATE,
    "validTo" DATE,
    "saturdayRule" TEXT NOT NULL DEFAULT 'default',
    "sundayRule" TEXT NOT NULL DEFAULT 'default',
    "holidayRule" TEXT NOT NULL DEFAULT 'default',
    "cycleLengthDays" INTEGER NOT NULL DEFAULT 0,
    "cycleStartDate" DATE,
    "observation" TEXT NOT NULL DEFAULT '',
    "patternId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ShiftPattern" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "cycleLengthDays" INTEGER NOT NULL DEFAULT 7,
    "baseDate" DATE,
    "holidayApplication" TEXT NOT NULL DEFAULT 'default',
    "weekendApplication" TEXT NOT NULL DEFAULT 'default',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ShiftPatternDay" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "dayOffset" INTEGER NOT NULL,
    "statusCode" TEXT NOT NULL DEFAULT 'TRABAJA',
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftPatternDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessUser_email_key" ON "public"."AccessUser"("email" ASC);

-- CreateIndex
CREATE INDEX "AccessUser_isActive_idx" ON "public"."AccessUser"("isActive" ASC);

-- CreateIndex
CREATE INDEX "AccessUser_isSuperAdmin_idx" ON "public"."AccessUser"("isSuperAdmin" ASC);

-- CreateIndex
CREATE INDEX "Appointment_appointmentDate_idx" ON "public"."Appointment"("appointmentDate" ASC);

-- CreateIndex
CREATE INDEX "Appointment_appointmentReason_idx" ON "public"."Appointment"("appointmentReason" ASC);

-- CreateIndex
CREATE INDEX "Appointment_assignedExecutive_idx" ON "public"."Appointment"("assignedExecutive" ASC);

-- CreateIndex
CREATE INDEX "Appointment_createdAt_idx" ON "public"."Appointment"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "public"."Appointment"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_ticketNumber_key" ON "public"."Appointment"("ticketNumber" ASC);

-- CreateIndex
CREATE INDEX "Appointment_vehicleNumber_idx" ON "public"."Appointment"("vehicleNumber" ASC);

-- CreateIndex
CREATE INDEX "AppointmentReason_isActive_idx" ON "public"."AppointmentReason"("isActive" ASC);

-- CreateIndex
CREATE INDEX "AppointmentReason_sortOrder_idx" ON "public"."AppointmentReason"("sortOrder" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentReason_value_key" ON "public"."AppointmentReason"("value" ASC);

-- CreateIndex
CREATE INDEX "AppointmentReason_visibleToDriver_idx" ON "public"."AppointmentReason"("visibleToDriver" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "public"."AuditLog"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_module_createdAt_idx" ON "public"."AuditLog"("module" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_userEmail_createdAt_idx" ON "public"."AuditLog"("userEmail" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "BlockReason_code_key" ON "public"."BlockReason"("code" ASC);

-- CreateIndex
CREATE INDEX "BlockReason_isActive_idx" ON "public"."BlockReason"("isActive" ASC);

-- CreateIndex
CREATE INDEX "BlockReason_sortOrder_idx" ON "public"."BlockReason"("sortOrder" ASC);

-- CreateIndex
CREATE INDEX "DailySchedule_appointmentId_idx" ON "public"."DailySchedule"("appointmentId" ASC);

-- CreateIndex
CREATE INDEX "DailySchedule_date_idx" ON "public"."DailySchedule"("date" ASC);

-- CreateIndex
CREATE INDEX "DailySchedule_driverBlockId_idx" ON "public"."DailySchedule"("driverBlockId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DailySchedule_driverOwnerId_date_key" ON "public"."DailySchedule"("driverOwnerId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "DailySchedule_effectiveStatusId_idx" ON "public"."DailySchedule"("effectiveStatusId" ASC);

-- CreateIndex
CREATE INDEX "DailySchedule_isManualOverride_idx" ON "public"."DailySchedule"("isManualOverride" ASC);

-- CreateIndex
CREATE INDEX "DailySchedule_monthlyScheduleId_idx" ON "public"."DailySchedule"("monthlyScheduleId" ASC);

-- CreateIndex
CREATE INDEX "DailySchedule_vehicleNumber_date_idx" ON "public"."DailySchedule"("vehicleNumber" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "DailyScheduleEvent_appointmentId_idx" ON "public"."DailyScheduleEvent"("appointmentId" ASC);

-- CreateIndex
CREATE INDEX "DailyScheduleEvent_dailyScheduleId_idx" ON "public"."DailyScheduleEvent"("dailyScheduleId" ASC);

-- CreateIndex
CREATE INDEX "DailyScheduleEvent_eventType_idx" ON "public"."DailyScheduleEvent"("eventType" ASC);

-- CreateIndex
CREATE INDEX "DriverBlock_blockReasonId_idx" ON "public"."DriverBlock"("blockReasonId" ASC);

-- CreateIndex
CREATE INDEX "DriverBlock_driverOwnerId_startsAt_idx" ON "public"."DriverBlock"("driverOwnerId" ASC, "startsAt" ASC);

-- CreateIndex
CREATE INDEX "DriverBlock_isActive_idx" ON "public"."DriverBlock"("isActive" ASC);

-- CreateIndex
CREATE INDEX "DriverBlock_status_idx" ON "public"."DriverBlock"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DriverGroup_code_key" ON "public"."DriverGroup"("code" ASC);

-- CreateIndex
CREATE INDEX "DriverGroup_isActive_idx" ON "public"."DriverGroup"("isActive" ASC);

-- CreateIndex
CREATE INDEX "DriverGroup_sortOrder_idx" ON "public"."DriverGroup"("sortOrder" ASC);

-- CreateIndex
CREATE INDEX "DriverLongTripRestriction_driverOwnerId_isActive_idx" ON "public"."DriverLongTripRestriction"("driverOwnerId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "DriverLongTripRestriction_status_idx" ON "public"."DriverLongTripRestriction"("status" ASC);

-- CreateIndex
CREATE INDEX "DriverOwner_fullName_idx" ON "public"."DriverOwner"("fullName" ASC);

-- CreateIndex
CREATE INDEX "DriverOwner_groupId_idx" ON "public"."DriverOwner"("groupId" ASC);

-- CreateIndex
CREATE INDEX "DriverOwner_isActive_idx" ON "public"."DriverOwner"("isActive" ASC);

-- CreateIndex
CREATE INDEX "DriverOwner_licensePlate_idx" ON "public"."DriverOwner"("licensePlate" ASC);

-- CreateIndex
CREATE INDEX "DriverOwner_recordStatus_idx" ON "public"."DriverOwner"("recordStatus" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DriverOwner_vehicleNumber_key" ON "public"."DriverOwner"("vehicleNumber" ASC);

-- CreateIndex
CREATE INDEX "DriverShiftAssignment_driverOwnerId_effectiveFrom_idx" ON "public"."DriverShiftAssignment"("driverOwnerId" ASC, "effectiveFrom" ASC);

-- CreateIndex
CREATE INDEX "DriverShiftAssignment_isActive_idx" ON "public"."DriverShiftAssignment"("isActive" ASC);

-- CreateIndex
CREATE INDEX "DriverShiftAssignment_patternId_idx" ON "public"."DriverShiftAssignment"("patternId" ASC);

-- CreateIndex
CREATE INDEX "DriverShiftAssignment_shiftDefinitionId_idx" ON "public"."DriverShiftAssignment"("shiftDefinitionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DriverSubgroup_groupId_type_code_key" ON "public"."DriverSubgroup"("groupId" ASC, "type" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "DriverSubgroup_groupId_type_isActive_idx" ON "public"."DriverSubgroup"("groupId" ASC, "type" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "DriverSubgroup_isActive_idx" ON "public"."DriverSubgroup"("isActive" ASC);

-- CreateIndex
CREATE INDEX "DriverSubgroup_sortOrder_idx" ON "public"."DriverSubgroup"("sortOrder" ASC);

-- CreateIndex
CREATE INDEX "DriverSubgroupAssignment_driverId_idx" ON "public"."DriverSubgroupAssignment"("driverId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DriverSubgroupAssignment_driverId_subgroupId_key" ON "public"."DriverSubgroupAssignment"("driverId" ASC, "subgroupId" ASC);

-- CreateIndex
CREATE INDEX "DriverSubgroupAssignment_subgroupId_idx" ON "public"."DriverSubgroupAssignment"("subgroupId" ASC);

-- CreateIndex
CREATE INDEX "Executive_isActive_idx" ON "public"."Executive"("isActive" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Executive_name_key" ON "public"."Executive"("name" ASC);

-- CreateIndex
CREATE INDEX "Executive_sortOrder_idx" ON "public"."Executive"("sortOrder" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "public"."Holiday"("date" ASC);

-- CreateIndex
CREATE INDEX "Holiday_isActive_idx" ON "public"."Holiday"("isActive" ASC);

-- CreateIndex
CREATE INDEX "Holiday_year_idx" ON "public"."Holiday"("year" ASC);

-- CreateIndex
CREATE INDEX "MonthlySchedule_status_idx" ON "public"."MonthlySchedule"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySchedule_year_month_key" ON "public"."MonthlySchedule"("year" ASC, "month" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OperationalStatus_code_key" ON "public"."OperationalStatus"("code" ASC);

-- CreateIndex
CREATE INDEX "OperationalStatus_isActive_idx" ON "public"."OperationalStatus"("isActive" ASC);

-- CreateIndex
CREATE INDEX "OperationalStatus_priority_idx" ON "public"."OperationalStatus"("priority" ASC);

-- CreateIndex
CREATE INDEX "OperationalStatus_sortOrder_idx" ON "public"."OperationalStatus"("sortOrder" ASC);

-- CreateIndex
CREATE INDEX "Propietario_fullName_idx" ON "public"."Propietario"("fullName" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Propietario_importKey_key" ON "public"."Propietario"("importKey" ASC);

-- CreateIndex
CREATE INDEX "Propietario_isActive_idx" ON "public"."Propietario"("isActive" ASC);

-- CreateIndex
CREATE INDEX "Propietario_rut_idx" ON "public"."Propietario"("rut" ASC);

-- CreateIndex
CREATE INDEX "Propietario_vehicleNumber_idx" ON "public"."Propietario"("vehicleNumber" ASC);

-- CreateIndex
CREATE INDEX "PropietarioBank_isActive_idx" ON "public"."PropietarioBank"("isActive" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PropietarioBank_name_key" ON "public"."PropietarioBank"("name" ASC);

-- CreateIndex
CREATE INDEX "PropietarioBank_sortOrder_idx" ON "public"."PropietarioBank"("sortOrder" ASC);

-- CreateIndex
CREATE INDEX "ShiftDayRule_shiftDefinitionId_idx" ON "public"."ShiftDayRule"("shiftDefinitionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftDayRule_shiftDefinitionId_weekday_key" ON "public"."ShiftDayRule"("shiftDefinitionId" ASC, "weekday" ASC);

-- CreateIndex
CREATE INDEX "ShiftDefinition_categorySubgroupId_idx" ON "public"."ShiftDefinition"("categorySubgroupId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftDefinition_code_key" ON "public"."ShiftDefinition"("code" ASC);

-- CreateIndex
CREATE INDEX "ShiftDefinition_groupId_idx" ON "public"."ShiftDefinition"("groupId" ASC);

-- CreateIndex
CREATE INDEX "ShiftDefinition_isActive_idx" ON "public"."ShiftDefinition"("isActive" ASC);

-- CreateIndex
CREATE INDEX "ShiftDefinition_patternId_idx" ON "public"."ShiftDefinition"("patternId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftPattern_code_key" ON "public"."ShiftPattern"("code" ASC);

-- CreateIndex
CREATE INDEX "ShiftPattern_isActive_idx" ON "public"."ShiftPattern"("isActive" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftPatternDay_patternId_dayOffset_key" ON "public"."ShiftPatternDay"("patternId" ASC, "dayOffset" ASC);

-- CreateIndex
CREATE INDEX "ShiftPatternDay_patternId_idx" ON "public"."ShiftPatternDay"("patternId" ASC);

-- AddForeignKey
ALTER TABLE "public"."DailySchedule" ADD CONSTRAINT "DailySchedule_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "public"."Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailySchedule" ADD CONSTRAINT "DailySchedule_baseStatusId_fkey" FOREIGN KEY ("baseStatusId") REFERENCES "public"."OperationalStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailySchedule" ADD CONSTRAINT "DailySchedule_driverBlockId_fkey" FOREIGN KEY ("driverBlockId") REFERENCES "public"."DriverBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailySchedule" ADD CONSTRAINT "DailySchedule_driverOwnerId_fkey" FOREIGN KEY ("driverOwnerId") REFERENCES "public"."DriverOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailySchedule" ADD CONSTRAINT "DailySchedule_effectiveStatusId_fkey" FOREIGN KEY ("effectiveStatusId") REFERENCES "public"."OperationalStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailySchedule" ADD CONSTRAINT "DailySchedule_monthlyScheduleId_fkey" FOREIGN KEY ("monthlyScheduleId") REFERENCES "public"."MonthlySchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailySchedule" ADD CONSTRAINT "DailySchedule_shiftAssignmentId_fkey" FOREIGN KEY ("shiftAssignmentId") REFERENCES "public"."DriverShiftAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyScheduleEvent" ADD CONSTRAINT "DailyScheduleEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "public"."Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyScheduleEvent" ADD CONSTRAINT "DailyScheduleEvent_dailyScheduleId_fkey" FOREIGN KEY ("dailyScheduleId") REFERENCES "public"."DailySchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DriverBlock" ADD CONSTRAINT "DriverBlock_blockReasonId_fkey" FOREIGN KEY ("blockReasonId") REFERENCES "public"."BlockReason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DriverBlock" ADD CONSTRAINT "DriverBlock_driverOwnerId_fkey" FOREIGN KEY ("driverOwnerId") REFERENCES "public"."DriverOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DriverLongTripRestriction" ADD CONSTRAINT "DriverLongTripRestriction_driverOwnerId_fkey" FOREIGN KEY ("driverOwnerId") REFERENCES "public"."DriverOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DriverOwner" ADD CONSTRAINT "DriverOwner_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."DriverGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DriverShiftAssignment" ADD CONSTRAINT "DriverShiftAssignment_driverOwnerId_fkey" FOREIGN KEY ("driverOwnerId") REFERENCES "public"."DriverOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DriverShiftAssignment" ADD CONSTRAINT "DriverShiftAssignment_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "public"."ShiftPattern"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DriverShiftAssignment" ADD CONSTRAINT "DriverShiftAssignment_shiftDefinitionId_fkey" FOREIGN KEY ("shiftDefinitionId") REFERENCES "public"."ShiftDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DriverSubgroup" ADD CONSTRAINT "DriverSubgroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."DriverGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DriverSubgroupAssignment" ADD CONSTRAINT "DriverSubgroupAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."DriverOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DriverSubgroupAssignment" ADD CONSTRAINT "DriverSubgroupAssignment_subgroupId_fkey" FOREIGN KEY ("subgroupId") REFERENCES "public"."DriverSubgroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ShiftDayRule" ADD CONSTRAINT "ShiftDayRule_shiftDefinitionId_fkey" FOREIGN KEY ("shiftDefinitionId") REFERENCES "public"."ShiftDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ShiftDefinition" ADD CONSTRAINT "ShiftDefinition_categorySubgroupId_fkey" FOREIGN KEY ("categorySubgroupId") REFERENCES "public"."DriverSubgroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ShiftDefinition" ADD CONSTRAINT "ShiftDefinition_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."DriverGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ShiftDefinition" ADD CONSTRAINT "ShiftDefinition_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "public"."ShiftPattern"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ShiftPatternDay" ADD CONSTRAINT "ShiftPatternDay_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "public"."ShiftPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;
