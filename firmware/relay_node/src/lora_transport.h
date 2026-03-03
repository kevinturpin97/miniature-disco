/**
 * @file lora_transport.h
 * @brief Hardware LoRa transport — init, send frames, receive commands.
 */

#pragma once

#include "protocol_core.h"

/**
 * @brief Initialise the LoRa radio module.
 *        Must be called once in setup(). Halts on failure.
 */
void lora_init();

/**
 * @brief Put the LoRa radio into low-power sleep mode.
 */
void lora_sleep();

/**
 * @brief Transmit a pre-built LoRa frame.
 *
 * @param frame Frame to send.
 * @return true  Packet was transmitted.
 * @return false LoRa module error.
 */
bool lora_send(const LoRaFrame& frame);

/**
 * @brief Listen for an incoming command for up to @p timeout_ms.
 *
 * @param relay_id   This relay's ID — ignores commands for other relays.
 * @param out        Decoded command on success.
 * @param timeout_ms Maximum blocking wait in milliseconds.
 * @return true  A valid command addressed to this relay was received.
 * @return false Timeout or invalid packet.
 */
bool lora_receive_command(uint8_t relay_id,
                          LoRaCommand& out,
                          uint16_t timeout_ms);
