#!/bin/bash

# Esperar a que MySQL esté disponible
wait-for-it mysql:3306 -t 120 -- echo "MySQL is ready"

# Crear la base de datos
bun create-db

# Ejecutar las migraciones de la base de datos
timeout 10s bun migrations-db >/dev/null 2>&1

# Ejecutar las consultas en la base de datos
bun migrations-apply
# Inicializar la base de datos
bun initial-db
# Iniciar la aplicación
bun dev

# while true; datos
#     sleep 5
# done
