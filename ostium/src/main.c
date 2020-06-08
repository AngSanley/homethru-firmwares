/*
 * Copyright (c) 2020 Thru Technologies
 * Copyright (c) 2014-2018 Cesanta Software Limited
 * All rights reserved
 */

#include "mgos.h"
#include "mgos_mqtt.h"
#include "frozen.h"
#define RELAY_PIN 0

char config_topic[40];

static void net_cb(int ev, void *evd, void *arg)
{
    switch (ev)
    {
    case MGOS_NET_EV_DISCONNECTED:
        LOG(LL_INFO, ("%s", "Net disconnected"));
        break;
    case MGOS_NET_EV_CONNECTING:
        LOG(LL_INFO, ("%s", "Net connecting..."));
        break;
    case MGOS_NET_EV_CONNECTED:
        LOG(LL_INFO, ("%s", "Net connected"));
        break;
    case MGOS_NET_EV_IP_ACQUIRED:
        LOG(LL_INFO, ("%s", "Net got IP address"));
        break;
    }

    (void)evd;
    (void)arg;
}

static void gpio_sub(struct mg_connection *nc, const char *topic, int topic_len, const char *msg, int msg_len, void *ud)
{
    int control = -1;

    // parse JSON
    json_scanf(msg, msg_len, "{ control: %d }", &control);

    LOG(LL_INFO, ("Control: %d", control));

    if (control == 1) {
        LOG(LL_INFO, ("Turning on socket"));
        mgos_gpio_write(RELAY_PIN, false);

    } else if (control == 0) {
        LOG(LL_INFO, ("Turning off socket"));
        mgos_gpio_write(RELAY_PIN, true);

    } else {
        LOG(LL_INFO, ("I don't understand."));

    }

    (void)nc;
    (void)ud;
    (void)topic;
    (void)topic_len;
}

static void timer_cb(void *arg)
{
    static bool s_tick_tock = false;
    LOG(LL_INFO,
        ("%s uptime: %.2lf, RAM: %lu, %lu free", (s_tick_tock ? "Tick" : "Tock"),
         mgos_uptime(), (unsigned long)mgos_get_heap_size(),
         (unsigned long)mgos_get_free_heap_size()));
    s_tick_tock = !s_tick_tock;
#ifdef LED_PIN
    mgos_gpio_toggle(LED_PIN);
#endif
    (void)arg;
}

enum mgos_app_init_result mgos_app_init(void)
{
#ifdef LED_PIN
    mgos_gpio_setup_output(LED_PIN, 0);
#endif
    mgos_set_timer(1000 /* ms */, MGOS_TIMER_REPEAT, timer_cb, NULL);

    mgos_event_add_group_handler(MGOS_EVENT_GRP_NET, net_cb, NULL);

    // set RELAY_PIN to output
    mgos_gpio_setup_output(RELAY_PIN, true);

    // mqtt subscribe
    sprintf(config_topic, "devices/ostium/%s/control", mgos_sys_config_get_device_id());
    mgos_mqtt_sub(config_topic, gpio_sub, NULL);

    // mqtt publish


    return MGOS_APP_INIT_SUCCESS;
}