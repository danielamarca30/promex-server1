CREATE TABLE `atencion` (
	`id` varchar(36) NOT NULL,
	`ficha_id` varchar(36) NOT NULL,
	`empleado_id` varchar(36) NOT NULL,
	`inicio_atencion` timestamp NOT NULL,
	`fin_atencion` timestamp,
	`resultado` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `atencion_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categoria_servicio` (
	`id` varchar(36) NOT NULL,
	`nombre` varchar(50) NOT NULL,
	`descripcion` text,
	CONSTRAINT `categoria_servicio_id` PRIMARY KEY(`id`),
	CONSTRAINT `nombre_idx` UNIQUE(`nombre`)
);
--> statement-breakpoint
CREATE TABLE `comunicados` (
	`id` varchar(36) NOT NULL,
	`comunicado` text NOT NULL,
	`descripcion` text NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`usuario_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comunicados_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cotizaciones` (
	`id` varchar(36) NOT NULL,
	`mineral` varchar(255) NOT NULL,
	`cotizacion` decimal(10,2) NOT NULL,
	`unidad` varchar(5) NOT NULL,
	`fecha` timestamp NOT NULL DEFAULT (now()),
	`active` boolean NOT NULL DEFAULT true,
	`usuario_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cotizaciones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `empleado` (
	`id` varchar(36) NOT NULL,
	`nombres` varchar(100) NOT NULL,
	`apellidos` varchar(100) NOT NULL,
	`estado_empleado` enum('Disponible','Ocupado') NOT NULL DEFAULT 'Disponible',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `empleado_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ficha` (
	`id` varchar(36) NOT NULL,
	`codigo` varchar(20) NOT NULL,
	`estado_ficha` enum('Pendiente','Llamado','En_Atencion','Atendido','Cancelado','No_Presentado') NOT NULL DEFAULT 'Pendiente',
	`servicio_id` varchar(36) NOT NULL,
	`empleado_id` varchar(36),
	`punto_atencion_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ficha_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `metrica_tiempo_real` (
	`id` varchar(36) NOT NULL,
	`servicio_id` varchar(36) NOT NULL,
	`punto_atencion_id` varchar(36) NOT NULL,
	`tiempo_espera_promedio` int NOT NULL,
	`tiempo_atencion_promedio` int NOT NULL,
	`cantidad_en_espera` int NOT NULL,
	`cantidad_atendidos` int NOT NULL,
	`version` int NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `metrica_tiempo_real_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `punto_atencion` (
	`id` varchar(36) NOT NULL,
	`nombre` varchar(50) NOT NULL,
	`categoria_id` varchar(36) NOT NULL,
	`empleado_id` varchar(36),
	`activo` boolean NOT NULL DEFAULT true,
	CONSTRAINT `punto_atencion_id` PRIMARY KEY(`id`),
	CONSTRAINT `nombre_idx` UNIQUE(`nombre`)
);
--> statement-breakpoint
CREATE TABLE `rol` (
	`id` varchar(36) NOT NULL,
	`nombre` varchar(50) NOT NULL,
	`descripcion` text,
	`permisos` json NOT NULL,
	CONSTRAINT `rol_id` PRIMARY KEY(`id`),
	CONSTRAINT `nombre_idx` UNIQUE(`nombre`)
);
--> statement-breakpoint
CREATE TABLE `servicio` (
	`id` varchar(36) NOT NULL,
	`nombre` varchar(100) NOT NULL,
	`prioridad` int NOT NULL,
	`descripcion` text,
	`categoria_id` varchar(36) NOT NULL,
	`sub_categoria_id` varchar(36),
	`tiempo_estimado` int NOT NULL,
	`activo` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `servicio_id` PRIMARY KEY(`id`),
	CONSTRAINT `nombre_idx` UNIQUE(`nombre`)
);
--> statement-breakpoint
CREATE TABLE `sub_categoria_servicio` (
	`id` varchar(36) NOT NULL,
	`nombre` varchar(50) NOT NULL,
	`descripcion` text,
	`categoria_id` varchar(36) NOT NULL,
	CONSTRAINT `sub_categoria_servicio_id` PRIMARY KEY(`id`),
	CONSTRAINT `nombre_idx` UNIQUE(`nombre`)
);
--> statement-breakpoint
CREATE TABLE `usuario` (
	`id` varchar(36) NOT NULL,
	`username` varchar(50) NOT NULL,
	`password` varchar(255) NOT NULL,
	`email` varchar(100),
	`rol_id` varchar(36) NOT NULL,
	`empleado_id` varchar(36) NOT NULL,
	`activo` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `usuario_id` PRIMARY KEY(`id`),
	CONSTRAINT `username_idx` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` varchar(36) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`file_path` varchar(255) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`usuario_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `videos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `atencion` ADD CONSTRAINT `atencion_ficha_id_ficha_id_fk` FOREIGN KEY (`ficha_id`) REFERENCES `ficha`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `atencion` ADD CONSTRAINT `atencion_empleado_id_empleado_id_fk` FOREIGN KEY (`empleado_id`) REFERENCES `empleado`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ficha` ADD CONSTRAINT `ficha_servicio_id_servicio_id_fk` FOREIGN KEY (`servicio_id`) REFERENCES `servicio`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ficha` ADD CONSTRAINT `ficha_empleado_id_empleado_id_fk` FOREIGN KEY (`empleado_id`) REFERENCES `empleado`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ficha` ADD CONSTRAINT `ficha_punto_atencion_id_punto_atencion_id_fk` FOREIGN KEY (`punto_atencion_id`) REFERENCES `punto_atencion`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `metrica_tiempo_real` ADD CONSTRAINT `metrica_tiempo_real_servicio_id_servicio_id_fk` FOREIGN KEY (`servicio_id`) REFERENCES `servicio`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `metrica_tiempo_real` ADD CONSTRAINT `metrica_tiempo_real_punto_atencion_id_punto_atencion_id_fk` FOREIGN KEY (`punto_atencion_id`) REFERENCES `punto_atencion`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `punto_atencion` ADD CONSTRAINT `punto_atencion_categoria_id_categoria_servicio_id_fk` FOREIGN KEY (`categoria_id`) REFERENCES `categoria_servicio`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `punto_atencion` ADD CONSTRAINT `punto_atencion_empleado_id_empleado_id_fk` FOREIGN KEY (`empleado_id`) REFERENCES `empleado`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `servicio` ADD CONSTRAINT `servicio_categoria_id_categoria_servicio_id_fk` FOREIGN KEY (`categoria_id`) REFERENCES `categoria_servicio`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `servicio` ADD CONSTRAINT `servicio_sub_categoria_id_sub_categoria_servicio_id_fk` FOREIGN KEY (`sub_categoria_id`) REFERENCES `sub_categoria_servicio`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sub_categoria_servicio` ADD CONSTRAINT `sub_categoria_servicio_categoria_id_categoria_servicio_id_fk` FOREIGN KEY (`categoria_id`) REFERENCES `categoria_servicio`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `usuario` ADD CONSTRAINT `usuario_rol_id_rol_id_fk` FOREIGN KEY (`rol_id`) REFERENCES `rol`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `usuario` ADD CONSTRAINT `usuario_empleado_id_empleado_id_fk` FOREIGN KEY (`empleado_id`) REFERENCES `empleado`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ficha_idx` ON `atencion` (`ficha_id`);--> statement-breakpoint
CREATE INDEX `empleado_idx` ON `atencion` (`empleado_id`);--> statement-breakpoint
CREATE INDEX `inicio_atencion_idx` ON `atencion` (`inicio_atencion`);--> statement-breakpoint
CREATE INDEX `estado_idx` ON `empleado` (`estado_empleado`);--> statement-breakpoint
CREATE INDEX `codigo_idx` ON `ficha` (`codigo`);--> statement-breakpoint
CREATE INDEX `estado_idx` ON `ficha` (`estado_ficha`);--> statement-breakpoint
CREATE INDEX `servicio_idx` ON `ficha` (`servicio_id`);--> statement-breakpoint
CREATE INDEX `empleado_idx` ON `ficha` (`empleado_id`);--> statement-breakpoint
CREATE INDEX `punto_atencion_idx` ON `ficha` (`punto_atencion_id`);--> statement-breakpoint
CREATE INDEX `servicio_idx` ON `metrica_tiempo_real` (`servicio_id`);--> statement-breakpoint
CREATE INDEX `punto_atencion_idx` ON `metrica_tiempo_real` (`punto_atencion_id`);--> statement-breakpoint
CREATE INDEX `version_idx` ON `metrica_tiempo_real` (`version`);--> statement-breakpoint
CREATE INDEX `categoria_idx` ON `punto_atencion` (`categoria_id`);--> statement-breakpoint
CREATE INDEX `empleado_idx` ON `punto_atencion` (`empleado_id`);--> statement-breakpoint
CREATE INDEX `categoria_idx` ON `servicio` (`categoria_id`);--> statement-breakpoint
CREATE INDEX `sub_categoria_idx` ON `servicio` (`sub_categoria_id`);--> statement-breakpoint
CREATE INDEX `categoria_idx` ON `sub_categoria_servicio` (`categoria_id`);--> statement-breakpoint
CREATE INDEX `email_idx` ON `usuario` (`email`);--> statement-breakpoint
CREATE INDEX `rol_idx` ON `usuario` (`rol_id`);--> statement-breakpoint
CREATE INDEX `empleado_idx` ON `usuario` (`empleado_id`);