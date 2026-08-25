# Manual de administración — Race Room

> **Para qué sirve este documento:** es todo el contenido del manual para los dueños y el staff de Race Room, listo para diseñar. Explica cómo funciona el sistema de reservas, el panel de administración, las tablets de cada simulador y la operación del día a día.
>
> Los bloques marcados con **`[COMPLETAR: …]`** son datos del negocio que hay que rellenar antes de imprimir/publicar.

---

## 0. Cómo leer este manual

- **Dueño / Administrador:** leé todo. Vos configurás precios, horarios, promos y usuarios.
- **Operador (staff del local):** te alcanza con las secciones **3 (Acceso)**, **5 (Reservas)**, **9 (Tablets)**, **10 (Operación diaria)** y **12 (Problemas comunes)**.

**Glosario rápido**

| Término | Qué es |
|---|---|
| **Simulador / Puesto** | Cada butaca con volante + pantalla. Hay 5. |
| **Reserva** | Un turno de un cliente en un simulador, a una hora y por una duración. |
| **Código de acceso** | Clave de 4 caracteres que recibe el cliente al pagar. Se ingresa en la tablet del simulador para arrancar. |
| **Grupo** | Reserva de 2 a 5 simuladores en el mismo horario, con descuento. Un solo código para todos. |
| **Walk-in** | Cliente que llega al local sin reserva previa y lo cargás vos desde el panel. |
| **Panel / Admin** | El sitio de administración (raceroom.com.ar/admin). |
| **Kiosko** | Modo en que quedan bloqueadas las tablets y TVs mostrando solo la app. |

---

## 1. Qué es el sistema

Race Room funciona con **reservas y pagos 100% online**, más la posibilidad de cargar clientes que llegan sin reserva. Todo gira alrededor de un **código de 4 caracteres**:

1. El cliente reserva y paga por internet (o lo cargás vos en el local).
2. Recibe un **código** por email.
3. Va al simulador, ingresa el código en la **tablet** y la pantalla se activa sola por el tiempo que pagó.
4. Cuando se termina el tiempo, la sesión se cierra sola.

El dueño controla todo desde el **panel de administración**: ver reservas, cargar clientes, ver métricas, cambiar precios, horarios y promociones.

---

## 2. Los 5 simuladores y las pantallas

- Hay **5 simuladores**, cada uno con:
  - Una **TV** grande (la pantalla del juego).
  - Una **tablet** chica (donde el cliente ingresa el código).
- Las tablets y TVs quedan en **modo kiosko**: prenden solas con la app y no se puede salir a otras aplicaciones. Esto es a propósito, para que nadie las use para otra cosa.
- Si una TV o tablet quedó en una pantalla que no es la de Race Room, ver **Sección 12 (Problemas comunes)**.

---

## 3. Acceso al panel de administración

- **Dirección:** `raceroom.com.ar/admin`
- **Usuario y contraseña:** `[COMPLETAR: usuario y contraseña de cada persona]`
- Entrá siempre desde una compu o el celular del local. **No compartas la contraseña** con clientes.

### Roles (tipos de usuario)

| Rol | Qué puede hacer |
|---|---|
| **Administrador (dueño)** | Todo: ver y cargar reservas, cambiar precios, horarios, promos, email, y ver métricas. |
| **Operador (staff)** | Operación diaria: ver reservas, cargar walk-ins, iniciar/finalizar/cancelar sesiones. **No** puede cambiar precios ni configuración. |

> Recomendación: el staff usa un usuario **Operador**, no el del dueño. Así nadie cambia precios por error.

---

## 4. Recorrido por el panel

El menú lateral tiene dos grupos: **General** y **Gestión**.

### 4.1 Dashboard (`/admin`)
Pantalla de inicio. De un vistazo ves el estado del día: reservas, sesiones activas, ingresos y gráficos. Es lo primero que mirás al abrir.

### 4.2 Reservas (`/admin/reservas`)
El corazón de la operación. Ver **Sección 5**.

### 4.3 Métricas (`/admin/metricas`)
Gráficos e ingresos: cuánto se facturó, qué días y horarios son los más fuertes, cuántas reservas hubo. Sirve para decidir promos y horarios.

### 4.4 Simuladores (`/admin/puestos`)
La lista de los 5 simuladores y **sus precios** por duración (30, 60 y 120 minutos). Acá cambiás cuánto sale cada uno.

### 4.5 Configuración (`/admin/configuracion`)
Los ajustes generales del negocio. Ver **Sección 8**.

---

## 5. Reservas — la pantalla del día a día

En **Reservas** ves todos los turnos y gestionás la operación. Tres cosas que vas a hacer siempre:

### 5.1 Cargar un cliente que llega sin reserva (walk-in individual)
1. Botón para **nueva reserva** / cargar puesto.
2. Elegís el simulador, la duración y el horario.
3. Se cobra en el local (efectivo o el medio que uses) y la reserva queda registrada.

### 5.2 Cargar un grupo (2 a 5 simuladores juntos)
1. Botón **"Grupo"**.
2. Elegís **varios simuladores** para el mismo horario y la duración.
3. El sistema aplica **el descuento por grupo automáticamente** y te muestra el total.
4. Confirmás y te da **un código único** para todo el grupo.
5. Podés **"Iniciar grupo ahora"** si ya están jugando.

### 5.3 Acciones sobre una reserva
Sobre cada turno podés:
- **Iniciar** — arranca la sesión (la pantalla del simulador se activa).
- **Finalizar** — cierra la sesión antes de tiempo.
- **Cancelar** — anula la reserva.

> **Ojo:** una reserva **online se activa sola** cuando el cliente ingresa su código en la tablet. No hace falta que la "inicies" vos. Las acciones manuales son para walk-ins y para resolver casos puntuales.

---

## 6. Precios y promociones actuales

**Promo de inauguración vigente:**

| Producto | Precio |
|---|---|
| 30 minutos | **$6.000** |
| 1 hora | **$10.000** |
| Grupo de 5 amigos (1 hora c/u) | **$40.000** total |

Los precios de cada simulador se cambian en **Simuladores (`/admin/puestos`)**. Están en pesos y por duración (30 / 60 / 120 min).

---

## 7. Descuentos por grupo — cómo funcionan y cómo se configuran

Cuando alguien reserva **2 o más simuladores en el mismo horario**, se aplica un **descuento progresivo** sobre el total. Cuantos más simuladores, mayor el descuento:

| Simuladores juntos | Descuento | Total (a $10.000 c/u la hora) |
|---|---|---|
| 2 | 5% | $19.000 |
| 3 | 10% | $27.000 |
| 4 | 15% | $34.000 |
| 5 | 20% | **$40.000** |

El descuento es **el mismo porcentaje sin importar la duración** (aplica a 30, 60 o 120 min).

### Cómo se configura (solo Administrador)
En **Configuración → Descuentos por grupo**:
1. **Activar/desactivar** el descuento con el interruptor.
2. Cambiar el **porcentaje de cada tramo** (2, 3, 4 y 5 simuladores).
3. Opcional: poner **fecha de inicio y fin** para acotar la promo (ej. solo durante la inauguración). Si las dejás vacías, el descuento está siempre activo.
4. **Guardar**.

> Si el descuento aparece desactivado, el precio de grupo será la suma sin rebaja. Verificá que el interruptor esté encendido y que, si pusiste fechas, hoy esté dentro del período.

---

## 8. Configuración general (solo Administrador)

En **Configuración** se ajusta:

- **Horarios de atención:** hora de apertura y cierre, e intervalo entre turnos (cada 15 min por defecto). *La hora de cierre debe ser mayor a la de apertura, si no se apaga la disponibilidad.*
- **Cancelaciones:** si se permiten, hasta cuántas horas antes, y si son manuales o automáticas.
- **Emails:** si se envían los correos de confirmación y desde qué dirección salen.
- **Descuentos por grupo:** ver **Sección 7**.
- **Teléfono de contacto** que ve el cliente.

---

## 9. El flujo del cliente (para entenderlo)

Así vive la experiencia un cliente que reserva por internet:

1. Entra a **raceroom.com.ar/reserva**.
2. Elige **fecha**, **duración** (30/60/120) y **uno o varios simuladores**.
   - Si elige 2 o más, ve el **descuento de grupo** aplicado en el total.
3. Paga con **MercadoPago** (tarjeta, débito o efectivo vía QR/ticket).
4. Recibe un **código de 4 caracteres** por email en segundos.
5. Llega al local a la hora de su reserva.
6. En la **tablet del simulador**, toca "Iniciar sesión", ingresa el código y la pantalla se activa sola.
7. Cuando se acaba el tiempo, la sesión se cierra.

**Para grupos:** el código es **uno solo para todo el grupo**. Cada integrante lo usa en su tablet.

---

## 10. Las tablets — cómo se usa el código

Cada simulador tiene una tablet. Para el cliente:
1. Tocar **"Iniciar sesión"**.
2. Ingresar el **código de 4 caracteres**.
3. La pantalla del simulador se activa por el tiempo pagado.

Para el staff:
- El código es **personal e intransferible** y llega por email al confirmar el pago.
- Si un cliente no tiene el código a mano, podés buscar su reserva en el panel y ver el código, o cargarle un walk-in.

---

## 11. Operación diaria — checklist

**Al abrir:**
- [ ] Prender la térmica / los equipos. Las TVs y tablets levantan solas con la app (puede tardar un par de minutos).
- [ ] Entrar al **panel → Dashboard** y revisar las reservas del día.
- [ ] Verificar que las 5 tablets muestren la pantalla de "Iniciar sesión".

**Durante el día:**
- [ ] Cargar walk-ins y grupos desde **Reservas**.
- [ ] Las reservas online se activan solas cuando el cliente pone su código.

**Al cerrar:**
- [ ] Revisar que no queden sesiones activas colgadas (se cierran solas al pasar su horario, pero conviene chequear).
- [ ] Apagar según el procedimiento del local. `[COMPLETAR: procedimiento de cierre/energía si aplica]`

---

## 12. Problemas comunes y cómo resolverlos

**"Un cliente pagó pero no le llegó el código."**
El sistema tiene una red de seguridad que revisa los pagos cada 5 minutos y reenvía el código. Esperá unos minutos. Si el cliente dejó su email, le vuelve a llegar. Si no, buscá la reserva en el panel.

**"Aparecen horarios en gris / 'no disponibles' que deberían estar libres."**
Casi siempre es porque hay **reservas sin pagar (pendientes)** ocupando ese horario — por ejemplo, alguien que empezó a reservar y no terminó de pagar. Esas reservas **se liberan solas a los 30 minutos**. Si necesitás liberarlas antes, cancelalas desde el panel.

**"La pantalla de una TV/tablet no es la de Race Room (muestra Google, la Play, etc.)."**
`[COMPLETAR: instrucción para el staff — a quién avisar. Recomendación: no tocar los equipos ni intentar "arreglarlos" desde el sistema Android; avisar al soporte técnico.]`

**"Una sesión quedó activa y no se cierra."**
Las sesiones se cierran solas cuando pasa su horario (con unos minutos de gracia). Si igual quedó trabada, entrá a **Reservas** y tocá **Finalizar** sobre esa sesión.

**"Quiero hacer un reembolso."**
Los reembolsos se gestionan desde la cuenta de **MercadoPago**, no desde el panel. `[COMPLETAR: quién tiene acceso a MercadoPago y el criterio de reembolsos]`

---

## 13. Cobros y MercadoPago

- Todos los pagos online pasan por **MercadoPago** (cuenta del local).
- Cada pago queda vinculado a su reserva; el sistema confirma la reserva y envía el código automáticamente.
- **Reembolsos y disputas** se manejan desde el panel de MercadoPago.
- `[COMPLETAR: datos de la cuenta MercadoPago / a quién contactar por temas de cobro]`

---

## 14. Contacto y soporte

- **Soporte técnico del sistema:** `[COMPLETAR: nombre + WhatsApp]`
- **Dueños:** `[COMPLETAR]`
- **Reglas de la casa** (edad mínima, tiempo de tolerancia, política de reintegros, etc.): `[COMPLETAR]`

---

# Brief para Claude Design (armado del manual)

**Objetivo:** convertir este contenido en un manual visual (PDF) para dueños y staff de Race Room, alineado con el manual de marca.

- **Audiencia:** dueños (config) + staff operativo (uso diario). Nivel técnico bajo.
- **Tono:** `[COMPLETAR: vos / usted]` — recomendado **vos**, argentino, directo y simple.
- **Formato sugerido:** PDF, tamaño carta o A4, con índice, íconos por sección y capturas/mockups ilustrados del panel y de la tablet.
- **Identidad:** usar los colores de marca (rojo Race Room `#E60012` sobre fondo oscuro `#0A0A0C`), la tipografía de la marca y el **logo correcto** (`race-room-logo.png`, el cuadrado 512×512).
- **Estructura:** respetar las 14 secciones de arriba. Separar claramente lo que es **"para el dueño"** de lo que es **"para el staff"** (ej. con una banda de color o un ícono).
- **Elementos gráficos deseables:** el flujo del cliente (Sección 9) como infografía de 6 pasos; la tabla de descuentos por grupo (Sección 7) destacada; el checklist diario (Sección 11) como lista imprimible para pegar en el local.

**Datos a completar antes de diseñar** (buscar todos los `[COMPLETAR]`):
1. Usuario/contraseña del panel por persona.
2. Tono (vos/usted).
3. Procedimiento de cierre/energía del local.
4. Qué hacer / a quién avisar si una pantalla no muestra la app.
5. Acceso y criterio de reembolsos en MercadoPago.
6. Contacto de soporte técnico (nombre + WhatsApp) y de los dueños.
7. Reglas de la casa (edad mínima, tolerancia, reintegros).
