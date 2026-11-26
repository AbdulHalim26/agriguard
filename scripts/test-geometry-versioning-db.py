#!/usr/bin/env python3
"""D2 disposable PostgreSQL proof. No DSN, existing DB, .env or install support.

--check only checks local executables. --run creates its OWN short-lived cluster,
using Unix sockets and listen_addresses=''. Missing PostgreSQL exits 2/NOT_RUN,
never PASS. Auth/Storage bootstrap is deliberately NOT real Supabase integration.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
POC = ROOT / "supabase/poc/geometry-versioning"
TOOLS = ("initdb", "pg_ctl", "postgres", "psql")
POLYGON = [[107.285, -6.312], [107.286, -6.312], [107.286, -6.313], [107.285, -6.313]]
METADATA = {"policy": {"version": "land-geometry-v1"},
            "method": "GEOGRAPHICLIB_2.2.0_KARNEY_WGS84_GEODESIC",
            "source": "SYNTHETIC_TRUSTED_ISSUER_FIXTURE_NOT_BACKEND_INTEGRATION"}


def ident(number: int) -> str:
    return f"00000000-0000-4000-8000-{number:012d}"


def quote(value: str | None) -> str:
    return "null" if value is None else "'" + value.replace("'", "''") + "'"


def json_arg(value: object) -> str:
    return quote(json.dumps(value, separators=(",", ":"))) + "::jsonb"


def context(actor: int | None = None, role: str = "authenticated", method: str = "otp") -> str:
    assert role in ("authenticated", "anon", "service_role")
    claims = {} if actor is None else {"sub": ident(actor), "role": role,
        "phone": f"628000000000{actor}", "amr": [{"method": method}]}
    return f"set role {role}; set request.jwt.claims={quote(json.dumps(claims))};\n"


def find_tools() -> dict[str, str] | None:
    # Discover one complete, matching installation; never install or start one.
    folders = []
    for name in TOOLS:
        executable = shutil.which(name)
        if executable:
            folders.append(Path(executable).resolve().parent)
    for parent in (Path("/opt/homebrew/opt"), Path("/usr/local/opt")):
        if parent.is_dir():
            folders.extend(path / "bin" for path in parent.glob("postgresql*"))
    for folder in dict.fromkeys(folders):
        paths = {name: str(folder / name) for name in TOOLS}
        if not all(os.access(path, os.X_OK) for path in paths.values()):
            continue
        majors = []
        for path in paths.values():
            result = subprocess.run([path, "--version"], capture_output=True, text=True,
                env={"PATH": os.defpath, "LANG": "C", "LC_ALL": "C"}, timeout=5, check=True)
            match = re.search(r"PostgreSQL\)?\s+(\d+)", result.stdout)
            if not match:
                break
            majors.append(int(match.group(1)))
        if len(majors) == len(TOOLS) and len(set(majors)) == 1 and majors[0] >= 15:
            return paths
    return None


class Database:
    def __init__(self, tools: dict[str, str], temporary: Path):
        self.tools, self.temporary = tools, temporary
        self.data, self.socket = temporary / "d", temporary / "s"
        self.socket.mkdir(mode=0o700)
        self.name = "agriguard_geometry_poc_" + uuid.uuid4().hex[:12]
        # Whitelist, rather than inherit PGHOST/PGSERVICE/PGOPTIONS/passwords.
        # HOME is also private, so ~/.psqlrc/.pgpass cannot select a connection.
        self.env = {"PATH": os.defpath, "LANG": "C", "LC_ALL": "C", "TZ": "UTC",
                    "HOME": str(temporary), "PGCONNECT_TIMEOUT": "3",
                    "PGOPTIONS": "-c statement_timeout=20000 -c lock_timeout=15000"}
        self.children: list[subprocess.Popen[str]] = []
        self.races = 0

    def start(self) -> None:
        subprocess.run([self.tools["initdb"], "-D", str(self.data), "-U", "postgres",
            "--auth-local=trust", "--auth-host=reject", "--encoding=UTF8", "--locale=C", "--no-sync", "--no-instructions"],
            env=self.env, capture_output=True, text=True, timeout=45, check=True)
        # No TCP listener; constant port is safe because socket directory is new.
        options = f"-k {self.socket} -p 55432 -c listen_addresses='' -c unix_socket_permissions=0700"
        subprocess.run([self.tools["pg_ctl"], "-D", str(self.data), "-l", str(self.temporary / "pg.log"),
            "-o", options, "-w", "start"], env=self.env, capture_output=True, text=True, timeout=45, check=True)
        self.run(f"create database {self.name};", database="postgres")

    def command(self, database: str | None = None) -> list[str]:
        database = database or self.name
        assert database in (self.name, "postgres")  # Never accept an existing target/DSN.
        return [self.tools["psql"], "-X", "-qAt", "--no-password", "-v", "ON_ERROR_STOP=1",
                "-P", "pager=off", "-h", str(self.socket), "-p", "55432", "-U", "postgres", "-d", database]

    def run(self, sql: str, *, error: str | None = None, database: str | None = None) -> str:
        result = subprocess.run(self.command(database), input=sql, env=self.env,
            capture_output=True, text=True, timeout=45)
        self.verify(result.returncode, result.stderr, error)
        return result.stdout.strip()

    @staticmethod
    def verify(code: int, stderr: str, error: str | None = None) -> None:
        if error is not None:
            if code == 0 or error not in stderr:
                raise AssertionError(f"Expected {error!r}, got exit {code}: {stderr}")
        elif code:
            raise AssertionError(f"psql exit {code}: {stderr}")

    def file(self, path: Path, prefix: str = "") -> str:
        return self.run(prefix + path.read_text())

    def scalar(self, sql: str) -> str:
        return self.run(sql).strip()

    def head(self, parcel: int = 201) -> str:
        return self.scalar(f"select current_geometry_version_id from public.lahan where id={quote(ident(parcel))};")

    def snapshot(self) -> str:
        tables = ["public.lahan", "public.damage_reports", "public.audit_logs",
                  "agriguard_geometry.validation_receipts", "agriguard_geometry.versions", "agriguard_geometry.report_intents"]
        pairs = [f"{quote(table)},(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from {table} t)" for table in tables]
        return self.scalar("select jsonb_build_object(" + ",".join(pairs) + ");")

    def unchanged_error(self, sql: str, error: str) -> None:
        before = self.snapshot()
        self.run(sql, error=error)
        assert self.snapshot() == before, f"Unexpected persisted writes after {error}"

    def spawn(self, sql: str, app: str) -> subprocess.Popen[str]:
        process = subprocess.Popen(self.command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, env={**self.env, "PGAPPNAME": app})
        self.children.append(process)
        assert process.stdin is not None
        process.stdin.write(sql)
        process.stdin.close()
        process.stdin = None
        return process

    def wait(self, predicate, process: subprocess.Popen[str]) -> None:
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if predicate():
                return
            if process.poll() is not None:
                stdout, stderr = process.communicate()
                raise AssertionError(f"Transaction exited before lock barrier: {stdout}\n{stderr}")
            time.sleep(0.04)
        raise AssertionError("Real PostgreSQL lock barrier was not observed; concurrency NOT proven")

    def race(self, left_sql: str, right_sql: str, right_error: str | None = None) -> tuple[str, str]:
        """Assert real overlapping sessions via pg_blocking_pids, then release.

        Gate cancellation only disconnects a data-free supervisor. Transaction A
        commits normally; B must actually wait for A, not just run after a sleep.
        """
        self.races += 1
        tag = "geometry-" + uuid.uuid4().hex[:12]
        key = 810000 + self.races
        gate = self.spawn(f"set statement_timeout='40s'; select pg_advisory_lock({key}); select pg_sleep(30);", tag + "g")
        workers = [gate]
        try:
            self.wait(lambda: self.scalar("select exists(select 1 from pg_stat_activity where "
                f"application_name={quote(tag+'g')} and wait_event='PgSleep');") == "t", gate)
            gate_pid = self.scalar(f"select pid from pg_stat_activity where application_name={quote(tag+'g')};")
            assert gate_pid.isdigit()
            left = self.spawn(f"begin; {left_sql}\nselect pg_advisory_xact_lock({key}); commit;", tag + "a")
            workers.append(left)
            self.wait(lambda: self.scalar("select exists(select 1 from pg_stat_activity where "
                f"application_name={quote(tag+'a')} and {gate_pid}=any(pg_blocking_pids(pid)));") == "t", left)
            left_pid = self.scalar(f"select pid from pg_stat_activity where application_name={quote(tag+'a')};")
            assert left_pid.isdigit()
            right = self.spawn(f"begin; {right_sql}\ncommit;", tag + "b")
            workers.append(right)
            self.wait(lambda: self.scalar("select exists(select 1 from pg_stat_activity where "
                f"application_name={quote(tag+'b')} and {left_pid}=any(pg_blocking_pids(pid)));") == "t", right)
            assert self.scalar(f"select pg_cancel_backend({gate_pid});") == "t"
            out_a, err_a = left.communicate(timeout=25)
            out_b, err_b = right.communicate(timeout=25)
            gate.communicate(timeout=5)
            self.verify(left.returncode, err_a)
            self.verify(right.returncode, err_b, right_error)
            return out_a.strip(), out_b.strip()
        finally:
            for process in workers:
                if process.poll() is None:
                    process.terminate()
                    process.communicate(timeout=5)

    def stop(self) -> bool:
        for process in self.children:
            if process.poll() is None:
                process.terminate()
                process.communicate(timeout=5)
        if not (self.data / "postmaster.pid").exists():
            return True
        result = subprocess.run([self.tools["pg_ctl"], "-D", str(self.data), "-m", "immediate", "-w", "stop"],
            env=self.env, capture_output=True, text=True, timeout=20)
        return result.returncode == 0


def geometry_sql(command: int, expected: str | None, *, actor: int = 1, parcel: int = 201,
                 reason: str = "Explicit synthetic fixture", polygon=POLYGON) -> str:
    return (context(role="service_role") + "select public.stage_geometry_validation("
        f"{quote(ident(actor))},{quote(ident(command))},{quote(ident(parcel))},{quote(expected)},"
        f"{json_arg(polygon)},12236.422579571597,0.75,{quote(reason)},{json_arg(METADATA)});")


def advance_sql(receipt: str, actor: int = 1, method: str = "otp") -> str:
    return context(actor, method=method) + f"select public.advance_lahan_geometry({quote(receipt)});"


def payload(key: int, source: str = "manual", longitude: float = 107.2855) -> dict:
    manual = "rusak_ringan" if source == "manual" else None
    evidence = {"lahan": ident(201), "latitude": -6.3125, "longitude": longitude, "photos": ["a" * 64], "manual": manual}
    digest = hashlib.sha256(json.dumps(evidence, separators=(",", ":")).encode()).hexdigest()
    row = {"id": ident(100000 + key), "user_id": ident(1), "lahan_id": ident(201), "idempotency_key": ident(key),
           "latitude": -6.3125, "longitude": longitude, "client_created_at": "2026-11-17T03:00:00Z",
           "photo_paths": [f"{ident(1)}/reports/{ident(key)}/0_{'a' * 64}.jpg"], "photo_hash": "a" * 64,
           "submission_hash": digest, "evidence_source": source}
    if manual:
        row["manual_status"] = manual
    if source == "server_ai":
        row["ai_analysis_id"] = ident(401)
    return row


def intent_sql(command: int, captured: str | None, row: dict) -> str:
    return context(role="service_role") + f"select public.stage_report_geometry_intent({quote(ident(1))},{quote(ident(command))},{quote(captured)},{json_arg(row)});"


def commit_sql(intent: str, actor: int = 1) -> str:
    return context(actor) + f"select public.commit_report_with_geometry({quote(intent)});"


def prove(db: Database) -> None:
    candidate = (POC / "candidate.sql").read_text()
    install = "set agriguard.geometry_poc_install='LOCAL_DISPOSABLE_ONLY';\n"
    # Guard negative: even this NEW cluster's maintenance database is rejected.
    db.run(install + candidate, database="postgres", error="LOCAL_DISPOSABLE_POC_ONLY")
    db.file(POC / "bootstrap.sql", install)
    migrations = ROOT / "supabase/migrations"
    for name in ("0001_init.sql", "0003_fix_rls_recursion.sql", "0004_unique_water_level_district.sql",
                 "0005_water_levels_unique.sql", "0007_fix_signup_and_poktan_rls.sql", "0008_fix_handle_new_user.sql",
                 "0009_fix_onboarding_full_name.sql", "0010_phase0a_security.sql", "0011_phase0a_effective_grants.sql"):
        db.file(migrations / name)
    # Existing security suite uses rollback-only fixtures. No 0002/0006 seeds.
    db.file(ROOT / "supabase/tests/phase0a_security.sql", "set agriguard.local_security_tests='enabled';\n")
    db.file(POC / "fixtures.sql")
    legacy_query = f"select to_jsonb(r)-'geometry_version_id' from public.damage_reports r where id={quote(ident(801))};"
    legacy = db.scalar(legacy_query)
    db.run(install + candidate)
    db.file(POC / "assertions.sql")
    assert db.scalar(legacy_query) == legacy
    assert db.scalar(context(1) + f"select boundary_status from public.damage_report_geometry_context where report_id={quote(ident(801))};") == "LEGACY_BOUNDARY_UNKNOWN"
    print("PASS: guarded install, actual base migrations/security suite, effective ACL and null legacy preservation")

    receipt = db.scalar(geometry_sql(1001, None))
    for actor in (2, 3, 4, 5):
        db.unchanged_error(geometry_sql(1002 + actor, None, actor=actor), "PARCEL_ACCESS_DENIED")
        db.unchanged_error(advance_sql(receipt, actor), "VALIDATION_RECEIPT_REQUIRED")
    db.unchanged_error(advance_sql(receipt, method="password"), "AUTH_REQUIRED")
    db.unchanged_error(context(role="anon") + f"select public.advance_lahan_geometry({quote(receipt)});", "permission denied")
    db.unchanged_error(context(1) + geometry_sql(1001, None).split("\n", 1)[1], "permission denied")
    v1 = json.loads(db.run(advance_sql(receipt)))["version_id"]
    assert db.head() == v1
    view = json.loads(db.run(context(1) + f"select public.get_lahan_geometry_version({quote(v1)});"))
    assert view["provenance"] == "BASELINE_CAPTURED_NOT_HISTORICAL" and not view["ownership_verified"]
    assert view["review_status"] == "UNVERIFIED" and view["polygon"] == POLYGON
    assert view["declared_area_hectares"] == 0.75
    assert db.scalar(legacy_query) == legacy
    db.unchanged_error(context(3) + f"select public.get_lahan_geometry_version({quote(v1)});", "PARCEL_ACCESS_DENIED")
    assert db.scalar(context(3) + "select count(*) from public.damage_report_geometry_context;") == "0"
    assert db.scalar(context(1, method="password") + "select count(*) from public.damage_report_geometry_context;") == "0"
    print("PASS: OTP/owner/Poktan/read scope, baseline provenance and immutable legacy context")

    a = db.scalar(geometry_sql(1101, v1))
    b = db.scalar(geometry_sql(1102, v1, reason="Stale candidate"))
    v2 = json.loads(db.run(advance_sql(a)))["version_id"]
    db.unchanged_error(advance_sql(b), "VERSION_CONFLICT")
    v3 = json.loads(db.run(advance_sql(db.scalar(geometry_sql(1103, v2)))))["version_id"]
    assert json.loads(db.run(advance_sql(a)))["version_id"] == v2 and db.head() == v3
    assert json.loads(db.run(context(1) + f"select public.get_lahan_geometry_version({quote(v1)});")) == view
    for table in ("validation_receipts", "versions", "report_intents"):
        db.unchanged_error(f"update agriguard_geometry.{table} set id=id;", "IMMUTABLE_GEOMETRY_HISTORY")
        db.unchanged_error(f"delete from agriguard_geometry.{table};", "IMMUTABLE_GEOMETRY_HISTORY")
    db.unchanged_error("truncate agriguard_geometry.report_intents;", "IMMUTABLE_GEOMETRY_HISTORY")
    db.unchanged_error(context(1) + "set agriguard.geometry_writer='true'; update public.lahan set current_geometry_version_id=null "
        f"where id={quote(ident(201))};", "VERSION_RPC_REQUIRED")
    db.unchanged_error(context(1) + f"update public.lahan set polygon='[[1,1],[2,1],[2,2]]' where id={quote(ident(201))};", "VERSION_RPC_REQUIRED")
    print("PASS: append-only triggers, optimistic conflict, receipt replay and forged-GUC/direct-table bypass rejection")

    foreign = json.loads(db.run(advance_sql(db.scalar(geometry_sql(1201, None, actor=2, parcel=202)), actor=2)))["version_id"]
    db.unchanged_error(geometry_sql(1213, foreign), "VERSION_PARCEL_MISMATCH")
    db.unchanged_error(intent_sql(1202, foreign, payload(720)), "VERSION_PARCEL_MISMATCH")
    db.unchanged_error(intent_sql(1203, v3, {**payload(721), "is_verified": True}), "SERVER_REPORT_VALIDATION_REQUIRED")
    missing = db.scalar(intent_sql(1204, None, payload(722)))
    db.unchanged_error(commit_sql(missing), "GEOMETRY_REFERENCE_REQUIRED")
    outside = db.scalar(intent_sql(1205, v3, payload(723, longitude=107.9)))
    db.unchanged_error(commit_sql(outside), "REPORT_OUTSIDE_VERSION")
    mismatch = db.scalar(intent_sql(1206, v3, {**payload(724, "server_ai"), "ai_analysis_id": ident(499)}))
    db.unchanged_error(commit_sql(mismatch), "AI_RECEIPT_MISMATCH")
    intent = db.scalar(intent_sql(1207, v3, payload(725)))
    saved = json.loads(db.run(commit_sql(intent)))
    assert saved["geometry_version_id"] == v3 and not saved["replayed"]
    ai = json.loads(db.run(commit_sql(db.scalar(intent_sql(1208, v3, payload(726, "server_ai"))))))
    assert db.scalar(f"select ai_confidence||':'||ai_damage_pct||':'||is_verified from public.damage_reports where id={quote(ai['id'])};") == "0.82:89:false"
    # Old legacy key is acknowledged without assigning today's geometry.
    old = json.loads(db.run(commit_sql(db.scalar(intent_sql(1209, None, payload(701))))))
    assert old["id"] == ident(801) and old["boundary_status"] == "LEGACY_BOUNDARY_UNKNOWN"
    assert db.scalar(legacy_query) == legacy
    head = json.loads(db.run(advance_sql(db.scalar(geometry_sql(1210, v3)))))["version_id"]
    retry = json.loads(db.run(commit_sql(intent)))
    assert retry["id"] == saved["id"] and retry["geometry_version_id"] == v3 and retry["replayed"]
    rebind = db.scalar(intent_sql(1211, head, payload(725)))
    db.unchanged_error(commit_sql(rebind), "IDEMPOTENCY_GEOMETRY_CONFLICT")
    changed = db.scalar(intent_sql(1212, v3, payload(725, longitude=107.2856)))
    db.unchanged_error(commit_sql(changed), "IDEMPOTENCY_CONFLICT")
    for sql in (f"update public.damage_reports set geometry_version_id={quote(head)} where id={quote(saved['id'])};",
                f"delete from public.damage_reports where id={quote(saved['id'])};"):
        db.unchanged_error(sql, "REPORT_BINDING_IMMUTABLE")
    print("PASS: exact report snapshot/geofence, raw receipt values, durable retries and immutable binding")

    # Test-only INSERT fixtures set old expiry; never UPDATE an immutable receipt.
    db.run("insert into agriguard_geometry.validation_receipts(id,actor_id,command_id,parcel_id,expected_version_id,original_polygon,computed_area_m2,declared_area_hectares,reason,validation_metadata,expires_at) "
        f"values({quote(ident(1301))},{quote(ident(1))},{quote(ident(1302))},{quote(ident(201))},{quote(head)},{json_arg(POLYGON)},12236,0.75,'expired synthetic',{json_arg(METADATA)},clock_timestamp()-interval '1 second');")
    db.unchanged_error(advance_sql(ident(1301)), "VALIDATION_RECEIPT_EXPIRED")
    for command, row in ((1303, payload(727)), (1304, payload(725))):
        db.run("insert into agriguard_geometry.report_intents(id,actor_id,parcel_id,captured_version_id,payload,expires_at) "
            f"values({quote(ident(command))},{quote(ident(1))},{quote(ident(201))},{quote(v3)},{json_arg(row)},clock_timestamp()-interval '1 second');")
    db.unchanged_error(commit_sql(ident(1303)), "REPORT_INTENT_EXPIRED")
    assert json.loads(db.run(commit_sql(ident(1304))))["id"] == saved["id"]

    fault = """create function agriguard_geometry.test_abort_audit() returns trigger language plpgsql as $$
      begin raise exception 'POC_INJECTED_AUDIT_FAILURE'; end $$;
      create trigger zzz_poc_abort before insert on public.audit_logs for each row
      when(new.action in ('advance_lahan_geometry','submit_versioned_report'))
      execute function agriguard_geometry.test_abort_audit();"""
    unfault = "drop trigger zzz_poc_abort on public.audit_logs; drop function agriguard_geometry.test_abort_audit();"
    receipt = db.scalar(geometry_sql(1401, head))
    db.run(fault)
    db.unchanged_error(advance_sql(receipt), "POC_INJECTED_AUDIT_FAILURE")
    db.run(unfault)
    head = json.loads(db.run(advance_sql(receipt)))["version_id"]
    report_intent = db.scalar(intent_sql(1402, head, payload(728)))
    db.run(fault)
    db.unchanged_error(commit_sql(report_intent), "POC_INJECTED_AUDIT_FAILURE")
    db.run(unfault)
    db.run(commit_sql(report_intent))
    print("PASS: expired artifacts, successful retry after expiry, genuine statement rollback after version/head/report writes")

    # Real overlapping PostgreSQL transactions, NOT Promise/memory serialization.
    for command, changed_reason in ((1501, False), (1502, True)):
        left_sql = geometry_sql(command, head)
        right_sql = geometry_sql(command, head, reason="Changed racing payload") if changed_reason else left_sql
        count = int(db.scalar("select count(*) from agriguard_geometry.validation_receipts;"))
        left, right = db.race(left_sql, right_sql, "COMMAND_REPLAY_CONFLICT" if changed_reason else None)
        assert int(db.scalar("select count(*) from agriguard_geometry.validation_receipts;")) == count + 1
        if not changed_reason:
            assert left == right
    for command, changed_time in ((1505, False), (1506, True)):
        row = payload(733 + int(changed_time))
        left_sql = intent_sql(command, head, row)
        other = {**row, "client_created_at": "2026-11-17T03:01:00Z"} if changed_time else row
        count = int(db.scalar("select count(*) from agriguard_geometry.report_intents;"))
        one, two = db.race(left_sql, intent_sql(command, head, other), "COMMAND_REPLAY_CONFLICT" if changed_time else None)
        assert int(db.scalar("select count(*) from agriguard_geometry.report_intents;")) == count + 1
        if not changed_time:
            assert one == two == ident(command)
    left = db.scalar(geometry_sql(1503, head))
    right = db.scalar(geometry_sql(1504, head, reason="Competing head"))
    count = int(db.scalar("select count(*) from agriguard_geometry.versions;"))
    advanced, _ = db.race(advance_sql(left), advance_sql(right), "VERSION_CONFLICT")
    head = json.loads(advanced)["version_id"]
    assert db.head() == head and int(db.scalar("select count(*) from agriguard_geometry.versions;")) == count + 1
    print("PASS: observed overlapping issuer replay/conflict and expected-head writer conflict (pg_blocking_pids barriers)")

    row = payload(730)
    intent = db.scalar(intent_sql(1601, head, row))
    count = int(db.scalar("select count(*) from public.damage_reports;"))
    one, two = db.race(commit_sql(intent), commit_sql(intent))
    assert json.loads(one)["id"] == json.loads(two)["id"] and json.loads(two)["replayed"]
    assert int(db.scalar("select count(*) from public.damage_reports;")) == count + 1
    # Report wins the lock: the accepted old snapshot survives the later head.
    intent = db.scalar(intent_sql(1602, head, payload(731)))
    next_receipt = db.scalar(geometry_sql(1603, head))
    old_head = head
    report, advanced = db.race(commit_sql(intent), advance_sql(next_receipt))
    head = json.loads(advanced)["version_id"]
    assert json.loads(report)["geometry_version_id"] == old_head and db.head() == head
    # Boundary wins: the new report is explicitly stale, with no inserted row.
    intent = db.scalar(intent_sql(1604, head, payload(732)))
    next_receipt = db.scalar(geometry_sql(1605, head))
    count = int(db.scalar("select count(*) from public.damage_reports;"))
    db.race(advance_sql(next_receipt), commit_sql(intent), "GEOMETRY_VERSION_STALE")
    assert int(db.scalar("select count(*) from public.damage_reports;")) == count
    assert db.scalar(legacy_query) == legacy
    db.file(POC / "assertions.sql")
    print("PASS: overlapping duplicate report and BOTH report/head lock orders; legacy and ACL invariants retained")
    print(f"DATABASE_TRANSACTION_TESTED: {db.races} observed overlapping transaction pairs; Supabase platform integration UNVERIFIED")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="check executables only; no DB/file creation")
    mode.add_argument("--run", action="store_true", help="create and remove a new Unix-socket-only disposable cluster")
    args = parser.parse_args()
    tools = find_tools()
    if tools is None:
        print("NOT_RUN / DATABASE_TRANSACTION_UNVERIFIED: complete matching PostgreSQL 15+ initdb/pg_ctl/postgres/psql installation unavailable; no database contacted")
        return 2
    if args.check:
        print("PREREQUISITES_AVAILABLE: PostgreSQL 15+ tools only; database tests NOT_RUN")
        return 0
    if not __debug__:
        parser.error("Assertions must be enabled: run without -O or PYTHONOPTIMIZE")
    if hasattr(os, "getuid") and os.getuid() == 0:
        print("NOT_RUN: PostgreSQL must run as an unprivileged local user")
        return 2
    parent = Path("/var/folders/rq/5bcwgxx16_df8lrrvt_vb5hw0000gn/T/opencode") if sys.platform == "darwin" else Path("/tmp")
    if not parent.is_dir():
        print("NOT_RUN: approved temporary parent unavailable")
        return 2
    temporary = Path(tempfile.mkdtemp(prefix="g-", dir=parent))
    database = Database(tools, temporary)
    try:
        database.start()
        prove(database)
        return 0
    finally:
        if database.stop():
            shutil.rmtree(temporary)
        else:
            raise RuntimeError(f"Disposable server shutdown failed; its private directory was preserved: {temporary}")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (AssertionError, subprocess.SubprocessError, OSError) as exc:
        print(f"FAIL / DATABASE_TRANSACTION_PROOF_INCOMPLETE: {exc}", file=sys.stderr)
        sys.exit(1)
