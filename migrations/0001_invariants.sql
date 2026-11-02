-- Hand-authored invariants complement the Drizzle-generated relational schema.
CREATE UNIQUE INDEX one_active_system_incident ON incidents(monitor_id) WHERE source='system' AND status!='resolved';
CREATE UNIQUE INDEX one_workspace_owner ON memberships(organization_id) WHERE role='owner';
CREATE TRIGGER membership_role_insert BEFORE INSERT ON memberships WHEN NEW.role NOT IN ('owner','admin','member','viewer') BEGIN SELECT RAISE(ABORT,'Invalid role'); END;
CREATE TRIGGER membership_role_update BEFORE UPDATE OF role ON memberships WHEN NEW.role NOT IN ('owner','admin','member','viewer') BEGIN SELECT RAISE(ABORT,'Invalid role'); END;
CREATE TRIGGER incident_tenant_insert BEFORE INSERT ON incidents WHEN NEW.monitor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM monitors WHERE id=NEW.monitor_id AND organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'Cross-tenant monitor'); END;
CREATE TRIGGER page_monitor_tenant BEFORE INSERT ON status_page_monitors WHEN NOT EXISTS (SELECT 1 FROM monitors m JOIN status_pages p ON p.organization_id=m.organization_id WHERE m.id=NEW.monitor_id AND p.id=NEW.page_id) BEGIN SELECT RAISE(ABORT,'Cross-tenant status page'); END;
CREATE TRIGGER check_result_committed AFTER INSERT ON monitor_checks WHEN NEW.synthetic=0 BEGIN
  UPDATE monitors SET
    status=CASE WHEN NEW.success=1 THEN CASE WHEN status='down' AND successes+1<recovery_threshold THEN 'down' ELSE 'operational' END ELSE CASE WHEN failures+1>=failure_threshold THEN 'down' ELSE 'degraded' END END,
    failures=CASE WHEN NEW.success=1 THEN 0 ELSE failures+1 END,
    successes=CASE WHEN NEW.success=1 THEN successes+1 ELSE 0 END,
    last_checked=NEW.checked_at,latency=NEW.latency,last_error=NEW.error,
    next_check=NEW.checked_at+interval,claim_token=NULL,claim_until=NULL,updated_at=NEW.checked_at
  WHERE id=NEW.monitor_id;
  INSERT INTO monitor_aggregates(monitor_id,period,bucket,total,successful,latency_sum,latency_min,latency_max)
  VALUES(NEW.monitor_id,'hour',(NEW.checked_at/3600)*3600,1,NEW.success,NEW.latency,NEW.latency,NEW.latency)
  ON CONFLICT(monitor_id,period,bucket) DO UPDATE SET total=total+1,successful=successful+NEW.success,latency_sum=latency_sum+NEW.latency,latency_min=MIN(latency_min,NEW.latency),latency_max=MAX(latency_max,NEW.latency);
  INSERT INTO monitor_aggregates(monitor_id,period,bucket,total,successful,latency_sum,latency_min,latency_max)
  VALUES(NEW.monitor_id,'day',(NEW.checked_at/86400)*86400,1,NEW.success,NEW.latency,NEW.latency,NEW.latency)
  ON CONFLICT(monitor_id,period,bucket) DO UPDATE SET total=total+1,successful=successful+NEW.success,latency_sum=latency_sum+NEW.latency,latency_min=MIN(latency_min,NEW.latency),latency_max=MAX(latency_max,NEW.latency);
  INSERT OR IGNORE INTO incidents(id,organization_id,monitor_id,title,description,severity,status,source,started_at)
  SELECT 'auto-'||NEW.id,organization_id,id,name||' is unavailable',COALESCE(NEW.error,'Failure threshold reached'),'major','investigating','system',NEW.checked_at FROM monitors WHERE id=NEW.monitor_id AND status='down';
  UPDATE incidents SET status='resolved',resolved_at=NEW.checked_at,updated_by=NULL WHERE monitor_id=NEW.monitor_id AND source='system' AND status!='resolved' AND EXISTS(SELECT 1 FROM monitors WHERE id=NEW.monitor_id AND successes>=recovery_threshold);
END;
CREATE TRIGGER incident_created AFTER INSERT ON incidents BEGIN
  INSERT INTO incident_events(id,incident_id,status,message,created_at,actor_id) VALUES('created-'||NEW.id,NEW.id,NEW.status,CASE WHEN NEW.source='system' THEN 'Failure threshold reached. Automated investigation opened.' ELSE NEW.description END,NEW.started_at,NEW.created_by);
  INSERT OR IGNORE INTO notifications(id,organization_id,event_key,title,message,link,created_at)
  SELECT 'incident-'||NEW.id,NEW.organization_id,'incident.created:'||NEW.id,NEW.title,'A '||NEW.severity||' incident requires attention.','/incidents/'||NEW.id,NEW.started_at
  WHERE NEW.monitor_id IS NULL OR EXISTS(SELECT 1 FROM monitors WHERE id=NEW.monitor_id AND alerts=1);
END;
CREATE TRIGGER incident_recovered AFTER UPDATE OF status ON incidents WHEN NEW.status='resolved' AND OLD.status!='resolved' BEGIN
  INSERT INTO incident_events(id,incident_id,status,message,created_at,actor_id) SELECT 'recovery-'||NEW.id,NEW.id,'resolved','Recovery threshold reached. Service is operational.',NEW.resolved_at,NULL WHERE NEW.source='system' AND NEW.updated_by IS NULL;
  INSERT OR IGNORE INTO notifications(id,organization_id,event_key,title,message,link,created_at)
  SELECT 'resolved-'||NEW.id,NEW.organization_id,'incident.resolved:'||NEW.id,'Resolved: '||NEW.title,'The incident has been resolved.','/incidents/'||NEW.id,NEW.resolved_at
  WHERE NEW.monitor_id IS NULL OR EXISTS(SELECT 1 FROM monitors WHERE id=NEW.monitor_id AND alerts=1);
END;
CREATE TRIGGER notification_outbox AFTER INSERT ON notifications BEGIN
  INSERT OR IGNORE INTO notification_deliveries(id,notification_id,channel_id,status,attempts,next_attempt)
  SELECT NEW.id||':'||id,NEW.id,id,'pending',0,NEW.created_at FROM notification_channels WHERE organization_id=NEW.organization_id AND enabled=1;
END;
